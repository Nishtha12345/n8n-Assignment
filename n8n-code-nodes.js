/**
 * n8n Code node snippets for the weather alert workflow.
 *
 * Workflow shape:
 * 1. Schedule Trigger - every 3 hours
 * 2. Code node - "Build Open-Meteo Requests"
 * 3. HTTP Request node - GET {{$json.url}}
 * 4. Code node - "Evaluate Alerts and Dedupe"
 * 5. LLM node - generate Slack-ready text from {{$json.llmInput}}
 * 6. HTTP Request node - POST to Slack Incoming Webhook
 *
 * Copy each section into a separate n8n Code node.
 */

// ---------------------------------------------------------------------------
// Code node 1: Build Open-Meteo Requests
// Mode: Run Once for All Items
// ---------------------------------------------------------------------------

const cities = [
  {
    city: 'Tallinn',
    country: 'Estonia',
    latitude: 59.4370,
    longitude: 24.7536,
    thresholds: {
      rain24hMm: { headsUp: 10, urgent: 20, critical: 35 },
      snow24hCm: { headsUp: 2, urgent: 6, critical: 12 },
      windGustKmh: { headsUp: 45, urgent: 65, critical: 85 },
      heatC: { headsUp: 26, urgent: 30, critical: 34 },
      coldC: { headsUp: -8, urgent: -15, critical: -22 },
    },
  },
  {
    city: 'Madrid',
    country: 'Spain',
    latitude: 40.4168,
    longitude: -3.7038,
    thresholds: {
      rain24hMm: { headsUp: 8, urgent: 20, critical: 35 },
      snow24hCm: { headsUp: 0.5, urgent: 2, critical: 5 },
      windGustKmh: { headsUp: 45, urgent: 65, critical: 85 },
      heatC: { headsUp: 34, urgent: 38, critical: 42 },
      coldC: { headsUp: 0, urgent: -4, critical: -8 },
    },
  },
  {
    city: 'Warsaw',
    country: 'Poland',
    latitude: 52.2297,
    longitude: 21.0122,
    thresholds: {
      rain24hMm: { headsUp: 10, urgent: 25, critical: 40 },
      snow24hCm: { headsUp: 2, urgent: 6, critical: 12 },
      windGustKmh: { headsUp: 45, urgent: 65, critical: 85 },
      heatC: { headsUp: 30, urgent: 34, critical: 38 },
      coldC: { headsUp: -6, urgent: -12, critical: -18 },
    },
  },
  {
    city: 'Lagos',
    country: 'Nigeria',
    latitude: 6.5244,
    longitude: 3.3792,
    thresholds: {
      rain24hMm: { headsUp: 20, urgent: 45, critical: 75 },
      snow24hCm: { headsUp: 0.1, urgent: 1, critical: 2 },
      windGustKmh: { headsUp: 40, urgent: 60, critical: 80 },
      heatC: { headsUp: 33, urgent: 36, critical: 40 },
      coldC: { headsUp: 20, urgent: 18, critical: 16 },
    },
  },
];

return cities.map((cityConfig) => {
  const query = {
    latitude: String(cityConfig.latitude),
    longitude: String(cityConfig.longitude),
    hourly: [
      'temperature_2m',
      'precipitation',
      'rain',
      'snowfall',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    forecast_days: '3',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  };

  const params = Object.entries(query)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return {
    json: {
      ...cityConfig,
      url: `https://api.open-meteo.com/v1/forecast?${params}`,
    },
  };
});

// ---------------------------------------------------------------------------
// Code node 2: Evaluate Alerts and Dedupe
// Mode: Run Once for All Items
// Input: one forecast item per city from HTTP Request node
// ---------------------------------------------------------------------------

const DEDUPE_HOURS = 24;
const HORIZON_HOURS = 48;
const ROLLING_WINDOW_HOURS = 24;

const staticData = $getWorkflowStaticData('global');
staticData.weatherAlertHistory ??= {};

const now = new Date();
const nowMs = now.getTime();
const horizonEndMs = nowMs + HORIZON_HOURS * 60 * 60 * 1000;
const dedupeMs = DEDUPE_HOURS * 60 * 60 * 1000;

for (const [key, value] of Object.entries(staticData.weatherAlertHistory)) {
  if (!value?.sentAt || nowMs - value.sentAt > 72 * 60 * 60 * 1000) {
    delete staticData.weatherAlertHistory[key];
  }
}

function severityFromHigh(value, thresholds) {
  if (value >= thresholds.critical) return 'Critical';
  if (value >= thresholds.urgent) return 'Urgent';
  if (value >= thresholds.headsUp) return 'Heads-up';
  return null;
}

function severityFromLow(value, thresholds) {
  if (value <= thresholds.critical) return 'Critical';
  if (value <= thresholds.urgent) return 'Urgent';
  if (value <= thresholds.headsUp) return 'Heads-up';
  return null;
}

function severityRank(severity) {
  return { 'Heads-up': 1, Urgent: 2, Critical: 3 }[severity] ?? 0;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rollingMax(values, times, unit) {
  let best = { value: 0, startTime: null, endTime: null };

  for (let startIndex = 0; startIndex < values.length; startIndex += 1) {
    const startMs = new Date(times[startIndex]).getTime();
    let total = 0;
    let endTime = times[startIndex];

    for (let index = startIndex; index < values.length; index += 1) {
      const currentMs = new Date(times[index]).getTime();
      if (currentMs - startMs >= ROLLING_WINDOW_HOURS * 60 * 60 * 1000) break;
      total += toNumber(values[index]);
      endTime = times[index];
    }

    if (total > best.value) {
      best = {
        value: Number(total.toFixed(unit === 'cm' ? 1 : 0)),
        startTime: times[startIndex],
        endTime,
      };
    }
  }

  return best;
}

function peakMax(values, times) {
  return values.reduce(
    (best, value, index) => {
      const number = toNumber(value, -Infinity);
      return number > best.value ? { value: number, time: times[index] } : best;
    },
    { value: -Infinity, time: null },
  );
}

function peakMin(values, times) {
  return values.reduce(
    (best, value, index) => {
      const number = toNumber(value, Infinity);
      return number < best.value ? { value: number, time: times[index] } : best;
    },
    { value: Infinity, time: null },
  );
}

function compactTimeRange(startTime, endTime) {
  if (!startTime) return 'next 48 hours';
  if (!endTime || startTime === endTime) return startTime;
  return `${startTime} to ${endTime}`;
}

const output = [];
let cityConfigs = [];

try {
  cityConfigs = $('Build Open-Meteo Requests').all().map((item) => item.json);
} catch (error) {
  cityConfigs = [];
}

for (const [itemIndex, item] of $input.all().entries()) {
  const currentJson = item.json;
  const cityConfig = currentJson.thresholds ? currentJson : cityConfigs[itemIndex];
  const data = {
    ...cityConfig,
    ...currentJson,
  };
  const forecast = currentJson.forecast ?? currentJson.body ?? currentJson.data ?? currentJson;
  const hourly = forecast.hourly ?? {};
  const times = hourly.time ?? [];

  if (!data.city || !data.thresholds) {
    throw new Error(
      'Missing city metadata. Check that the previous Code node is named "Build Open-Meteo Requests" and that the HTTP Request node receives one item per city.',
    );
  }

  const selectedIndexes = times
    .map((time, index) => ({ time, index, ms: new Date(time).getTime() }))
    .filter(({ ms }) => ms >= nowMs && ms <= horizonEndMs)
    .map(({ index }) => index);

  if (!selectedIndexes.length) continue;

  const selectedTimes = selectedIndexes.map((index) => times[index]);
  const pick = (field) => selectedIndexes.map((index) => hourly[field]?.[index] ?? 0);

  const rawRainValues = pick('rain');
  const precipitationValues = pick('precipitation');
  const rainValues = rawRainValues.map((value, index) => {
    return hourly.rain ? value : precipitationValues[index];
  });
  const snowValues = pick('snowfall');
  const windSpeedValues = pick('wind_speed_10m');
  const windValues = pick('wind_gusts_10m').map((value, index) => {
    const windSpeed = windSpeedValues[index];
    return Math.max(toNumber(value), toNumber(windSpeed));
  });
  const temperatureValues = pick('temperature_2m');

  const alerts = [];
  const rain = rollingMax(rainValues, selectedTimes, 'mm');
  const snow = rollingMax(snowValues, selectedTimes, 'cm');
  const wind = peakMax(windValues, selectedTimes);
  const heat = peakMax(temperatureValues, selectedTimes);
  const cold = peakMin(temperatureValues, selectedTimes);

  const rainSeverity = severityFromHigh(rain.value, data.thresholds.rain24hMm);
  if (rainSeverity) {
    alerts.push({
      condition: 'Rain',
      severity: rainSeverity,
      value: `${rain.value} mm in 24h`,
      window: compactTimeRange(rain.startTime, rain.endTime),
      operationalRisk: 'Possible delays from heavy rain, wet roads and reduced visibility.',
    });
  }

  const snowSeverity = severityFromHigh(snow.value, data.thresholds.snow24hCm);
  if (snowSeverity) {
    alerts.push({
      condition: 'Snow',
      severity: snowSeverity,
      value: `${snow.value} cm in 24h`,
      window: compactTimeRange(snow.startTime, snow.endTime),
      operationalRisk: 'Possible road disruption and slower movement across the city.',
    });
  }

  const windSeverity = severityFromHigh(wind.value, data.thresholds.windGustKmh);
  if (windSeverity) {
    alerts.push({
      condition: 'Wind',
      severity: windSeverity,
      value: `${Math.round(wind.value)} km/h gusts`,
      window: wind.time,
      operationalRisk: 'Possible disruption for outdoor work, couriers and exposed routes.',
    });
  }

  const heatSeverity = severityFromHigh(heat.value, data.thresholds.heatC);
  if (heatSeverity) {
    alerts.push({
      condition: 'Heat',
      severity: heatSeverity,
      value: `${Math.round(heat.value)} C`,
      window: heat.time,
      operationalRisk: 'Possible heat stress risk for teams working outside.',
    });
  }

  const coldSeverity = severityFromLow(cold.value, data.thresholds.coldC);
  if (coldSeverity) {
    alerts.push({
      condition: 'Cold',
      severity: coldSeverity,
      value: `${Math.round(cold.value)} C`,
      window: cold.time,
      operationalRisk: 'Possible icy conditions and comfort risk for outdoor teams.',
    });
  }

  const newAlerts = alerts.filter((alert) => {
    const eventDate = String(alert.window).slice(0, 10);
    const dedupeKey = `${data.city}:${alert.condition}:${alert.severity}:${eventDate}`;
    const previous = staticData.weatherAlertHistory[dedupeKey];

    if (previous && nowMs - previous.sentAt < dedupeMs) {
      return false;
    }

    staticData.weatherAlertHistory[dedupeKey] = {
      sentAt: nowMs,
      value: alert.value,
    };
    return true;
  });

  if (!newAlerts.length) continue;

  const highestSeverity = newAlerts
    .map((alert) => alert.severity)
    .sort((a, b) => severityRank(b) - severityRank(a))[0];

  output.push({
    json: {
      city: data.city,
      country: data.country,
      generatedAt: now.toISOString(),
      forecastWindow: `next ${HORIZON_HOURS} hours`,
      highestSeverity,
      alerts: newAlerts,
      llmInput: JSON.stringify(
        {
          audience: 'non-technical Operations Manager',
          city: data.city,
          country: data.country,
          generatedAt: now.toISOString(),
          forecastWindow: `next ${HORIZON_HOURS} hours`,
          highestSeverity,
          alerts: newAlerts,
        },
        null,
        2,
      ),
      slackFallback: `Weather alert for ${data.city}: ${highestSeverity}. ${newAlerts
        .map((alert) => `${alert.condition} ${alert.value}`)
        .join('; ')}`,
    },
  });
}

return output;
