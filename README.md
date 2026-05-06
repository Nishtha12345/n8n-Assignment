# Weather Alert Automation for n8n

This is a compact home-task implementation for an AI & Automations Analyst role. It shows an n8n workflow that checks Open-Meteo every 3 hours, applies city-specific weather thresholds, deduplicates repeated alerts, uses Gemini to generate a plain-English operations message, and posts the result to Slack.

## What This Repo Contains

- `workflows/bolt-weather-risk-alerts-n8n-workflow.json` - sanitized n8n workflow export for review/import.
- `n8n-code-nodes.js` - JavaScript snippets used in the two n8n Code nodes.
- `llm-prompt.md` - final prompt used by the Gemini LLM node.
- `final-submission-writeup.md` - concise write-up covering Parts A, B and C.
- `Bolt-Weather-Automation-Final-Writeup.docx` - Word version of the final write-up.
- `task-summary.md` - short project summary and sample Slack alert.

No API keys are included. The Slack webhook in the exported workflow is replaced with `YOUR_SLACK_WEBHOOK_URL`.

## What Was Built

The workflow monitors four cities across a Europe/Africa operating mix:

- Tallinn, Estonia
- Madrid, Spain
- Warsaw, Poland
- Lagos, Nigeria

It checks the next 48 hours of hourly forecast data and alerts only when one or more city-specific thresholds are crossed. In normal conditions, the workflow can return no alert items; this is expected and is part of the no-noise design.

## Workflow Overview

1. Schedule Trigger runs every 3 hours.
2. Code node builds Open-Meteo request URLs for Tallinn, Madrid, Warsaw and Lagos.
3. HTTP Request node calls Open-Meteo for each city.
4. Code node checks the next 48 hours and applies thresholds for rain, snow, wind, heat and cold.
5. The same Code node deduplicates alerts using n8n workflow static data.
6. Gemini LLM node converts structured alert data into a clear Slack message.
7. HTTP Request node posts the message to Slack using an Incoming Webhook.

## Quick Review / Import Steps

1. Import `workflows/bolt-weather-risk-alerts-n8n-workflow.json` into n8n.
2. Add a Google Gemini credential to the `AI LLM Gemini` node.
3. Create a Slack Incoming Webhook and paste it into the `Post to Slack` node where the export says `YOUR_SLACK_WEBHOOK_URL`.
4. Run the workflow manually.
5. Confirm `Build Open-Meteo Requests` returns 4 items.
6. Confirm `Get Open-Meteo Forecast` returns Open-Meteo hourly forecast data.
7. Confirm `Evaluate Alerts and Dedupe` returns only cities with threshold-crossing risks.
8. Confirm Gemini generates Slack-ready text.
9. Confirm `Post to Slack` sends the alert to the selected Slack channel.

If no alerts are produced, that can be correct: it means all four cities are below alert thresholds. For demo testing only, temporarily lower one threshold such as a wind or rain Heads-up value, then restore the original values before final submission.

## Required Services

- n8n, run locally with `npx n8n` or Docker.
- Open-Meteo, no API key required.
- Google Gemini API key for the LLM step.
- Slack workspace with an Incoming Webhook.

The local n8n URL is usually:

```text
http://localhost:5678
```

## Slack Webhook Setup

Create a free Slack workspace or use a test workspace, then create a channel such as `#weather-alerts`.

To create the Incoming Webhook:

1. Go to `https://api.slack.com/apps`.
2. Click `Create New App`.
3. Choose `From scratch`.
4. Name the app, for example `Weather Alerts Bot`.
5. Select your Slack workspace.
6. In the app settings sidebar, open `Incoming Webhooks`.
7. Turn `Activate Incoming Webhooks` on.
8. Click `Add New Webhook to Workspace`.
9. Choose the channel where alerts should be posted.
10. Copy the generated webhook URL.

The webhook URL should look like:

```text
https://hooks.slack.com/services/...
```

In n8n, open the `Post to Slack` HTTP Request node and replace:

```text
YOUR_SLACK_WEBHOOK_URL
```

with your real Slack webhook URL.

Do not commit the real webhook URL to GitHub. If a webhook is ever pasted into a chat, screenshot or repository, rotate it in Slack and update the n8n node.

## Data Source vs Business Logic

The weather values are real forecast data from the Open-Meteo Forecast API, not mocked data. Each run calls:

```text
https://api.open-meteo.com/v1/forecast
```

The API returns hourly arrays for fields such as:

- `temperature_2m`
- `precipitation`
- `rain`
- `snowfall`
- `wind_speed_10m`
- `wind_gusts_10m`

The city thresholds are not returned by Open-Meteo. They are manually defined in the `Build Open-Meteo Requests` Code node as operational business logic. The second Code node compares live forecast values against these city-specific thresholds to decide whether to create a Heads-up, Urgent or Critical alert.

## n8n Node Setup

### 1. Schedule Trigger

Set the trigger interval to every 3 hours.

Recommended setting:

- Trigger Interval: Hours
- Hours Between Triggers: 3

### 2. Code Node: Build Open-Meteo Requests

Create a Code node named `Build Open-Meteo Requests`.

- Mode: Run Once for All Items
- Code: copy the first section from `n8n-code-nodes.js`

This returns one item per city, including the city name, coordinates, thresholds and Open-Meteo URL.

Note: `n8n-code-nodes.js` contains two separate snippets. Copy only the relevant section into each Code node.

### 3. HTTP Request Node: Open-Meteo Forecast

Create an HTTP Request node named `Get Open-Meteo Forecast`.

Recommended settings:

- Method: GET
- URL: `={{$json.url}}`
- Response Format: JSON

In some n8n versions there is no `Put Response in Field` option for JSON responses. That is fine. Leave the node on the default JSON response output. The next Code node reads the forecast from this HTTP node and reads the city metadata from the earlier `Build Open-Meteo Requests` node.

### 4. Code Node: Evaluate Alerts and Dedupe

Create a Code node named `Evaluate Alerts and Dedupe`.

- Mode: Run Once for All Items
- Code: copy the second section from `n8n-code-nodes.js`

This node:

- Looks at forecast hours from now through the next 48 hours.
- Calculates rolling 24-hour rain and snow totals.
- Checks peak wind gust, peak temperature and minimum temperature.
- Assigns Heads-up, Urgent or Critical severity.
- Deduplicates repeated city-condition-severity alerts for 24 hours.
- Returns one item per city only when there is a new alert.

If there are no new alerts, the node returns no items, so the LLM and Slack nodes do not run.

### 5. Gemini LLM Node: Generate Slack Alert

Use the Google Gemini node in n8n with the `Message a model` action. This project was tested with Gemini because it was available on a free API key.

Use the prompt in `llm-prompt.md`.

Pass this as the input variable:

```text
{{$json.llmInput}}
```

Expected output is a single Slack-ready text message.

### 6. HTTP Request Node: Slack Incoming Webhook

Create an HTTP Request node named `Post to Slack`.

Recommended settings:

- Method: POST
- URL: your Slack Incoming Webhook URL
- Send Body: JSON
- Specify Body: Using Fields Below
- Body parameter:

```text
Name: text
Value: ={{($json["content"]["parts"][0]["text"] || "").replace(/^\s*=+\s*/, "").trimStart()}}
```

Using fields below lets n8n safely handle multi-line Slack messages from Gemini. The expression also strips a leading `=` if the LLM ever mirrors n8n expression syntax in its output.

## Threshold Approach

Thresholds are intentionally simple and easy to explain in an interview:

- Rain: rolling 24-hour total in mm.
- Snow: rolling 24-hour total in cm.
- Wind: maximum wind gust in km/h.
- Heat: maximum forecast temperature in C.
- Cold: minimum forecast temperature in C.

Each city has its own thresholds because local climate and operational expectations differ. Lagos has higher rain thresholds, Madrid has lower snow thresholds, and Tallinn/Warsaw have lower cold thresholds.

## Deduplication

The workflow uses n8n workflow static data:

```javascript
const staticData = $getWorkflowStaticData('global');
```

Each alert is keyed by city, condition, severity and event date. If the same alert appears again within 24 hours, it is suppressed. If severity changes, a new alert is allowed.

This keeps the workflow simple while avoiding repeated Slack messages every 3 hours for the same forecast event.

## Testing Tips

- Run the workflow manually first and inspect each node output.
- Temporarily lower a threshold to confirm Slack posting works.
- Confirm the Gemini output is under 120 words and understandable without technical context.
- Confirm no Slack message is posted when the second Code node returns zero items.
- Rotate the Slack webhook if it has ever been pasted into a chat, screenshot or repository.

## Files

- `n8n-code-nodes.js` - Code node snippets.
- `llm-prompt.md` - LLM prompt.
- `task-summary.md` - summary and sample Slack alert.
- `final-submission-writeup.md` - final Markdown write-up.
- `Bolt-Weather-Automation-Final-Writeup.docx` - final Word write-up.
- `workflows/bolt-weather-risk-alerts-n8n-workflow.json` - sanitized n8n workflow export.
