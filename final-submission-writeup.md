# Bolt Weather Risk Alerts - Submission Write-Up

## Part A - Build the System

I built an n8n workflow that monitors weather risk for four Bolt Food-style operating cities: Tallinn, Madrid, Warsaw and Lagos. The workflow runs every 3 hours, calls Open-Meteo for each city, evaluates the next 48 hours of hourly forecast data and posts an alert to Slack when the forecast suggests likely operational impact.

The workflow is:

Schedule Trigger -> Build Open-Meteo Requests -> Get Open-Meteo Forecast -> Evaluate Alerts and Dedupe -> Gemini LLM -> Post to Slack

I chose the four cities to force different threshold logic: Tallinn represents Northern Europe, Madrid Southern Europe, Warsaw Eastern Europe and Lagos Africa. The same weather can mean very different things in each location, so the workflow does not use one global threshold.

The Code node checks five weather risks:

- Rain: highest rolling 24-hour rain total within the next 48 hours.
- Snow: highest rolling 24-hour snowfall total within the next 48 hours.
- Wind: maximum forecast gust or wind speed.
- Heat: maximum forecast temperature.
- Cold: minimum forecast temperature.

Each city has thresholds for Heads-up, Urgent and Critical. For example, snow thresholds are lower in Madrid and Lagos because even small snowfall would be operationally unusual there. Lagos has higher rain thresholds because heavy rain is more common, while Tallinn and Warsaw have colder temperature thresholds because they are more adapted to winter conditions.

The alert design is intentionally short and operational. A non-technical Operations Manager should be able to read it in under 30 seconds and understand the city, severity, forecast window, operational risk and recommended actions. The Slack alert avoids technical details like API fields or threshold names.

To reduce noise, the workflow deduplicates alerts using n8n workflow static data. Each alert is keyed by city, weather condition, severity and event date. The same alert is suppressed for 24 hours, but a new alert is allowed if severity changes. One failure mode I considered was repeated Slack posts during a long weather event; the dedupe logic handles that while still allowing escalation.

## Part B - Use AI Where Rules Are Weak

The rules engine decides whether an alert should be sent. I used deterministic code for this because threshold logic should be predictable and explainable.

I used Gemini for the part that rules do less well: turning structured alert data into a clear, city-specific Slack message for an Operations Manager. The LLM receives the city, severity, forecast window, triggered weather risks and operational risk notes, then rewrites them into plain language with practical next steps.

This is a better fit for AI than for rules because the message needs to combine multiple signals into natural operational guidance. For example, wind and rain together should read differently from heat alone, and the wording should be calm, concise and action-oriented rather than a raw data dump.

Evaluation sentence: I would monitor whether LLM-generated alerts stay under 120 words, include a clear operational action and avoid adding weather facts that were not present in the structured input.

## Part C - Scale It

The next automation I would build is a weather impact feedback loop. After each alert, the system would compare forecasted risk against operational outcomes such as courier acceptance rate, delivery time, cancellations and supply shortages in that city. This would help Central Operations learn which weather patterns actually move the business and which alerts are noise.

This would help local Operations Managers because thresholds would become more evidence-based over time. It would also help central teams because they could identify cities that need proactive courier incentives, adjusted ETAs or customer messaging before service quality drops.

The metric I would commit to moving is weather-related late deliveries or delivery time deviation during severe weather windows. A practical first target would be reducing delivery time deviation in alerted cities by improving how early Operations can act before conditions peak.

## Appendix - Final LLM Prompt

System message:

You write short operational Slack alerts for a non-technical Operations Manager.

The alert must be clear, calm and actionable. Do not mention APIs, JSON, thresholds, models, nodes, code or internal workflow details. Do not add facts that are not present in the input.

User message:

Create one Slack message from this weather alert input:

```json
{{$json.llmInput}}
```

Formatting rules:

- Start with one clear headline containing the city and severity.
- Mention the forecast window.
- Summarize the weather risk in plain English.
- Include 2-3 practical actions for Operations.
- Keep it under 120 words.
- Use Slack-friendly formatting with short lines.
- Output only the Slack message text.

## Appendix - Submitted Workflow Export

The n8n workflow export is provided separately as:

`Bolt-Weather Risk Alerts - Open-Meteo to Slack.submission.json`

The Slack webhook URL has been replaced with `YOUR_SLACK_WEBHOOK_URL` so no secrets are included in the submission file.
