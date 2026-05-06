# Task Summary

This project contains a simple n8n design for automated city-level weather alerts.

The workflow runs every 3 hours, checks the Open-Meteo forecast for Tallinn, Madrid, Warsaw and Lagos, evaluates the next 24-48 hours against city-specific weather thresholds, deduplicates repeated alerts and asks Gemini to write a clear Slack message for an Operations Manager. The final alert is posted to Slack through an Incoming Webhook.

## Included Files

- `n8n-code-nodes.js` - JavaScript for the two n8n Code nodes.
- `llm-prompt.md` - prompt for converting structured alert data into a Slack-ready message.
- `README.md` - implementation guide and node-by-node setup.
- `final-submission-writeup.md` - final submission write-up.
- `task-summary.md` - this overview, including a sample alert.

## Severity Logic

The Code node creates three levels:

- Heads-up - conditions may affect operations and should be monitored.
- Urgent - likely disruption; Operations should take action.
- Critical - high-risk weather; immediate operational attention needed.

The exact thresholds are city-specific because the same weather can have different operational impact in different climates. For example, snow is treated as lower-threshold risk in Madrid and Lagos than in Tallinn or Warsaw.

## Sample Slack Alert

```text
:rotating_light: Weather alert for Warsaw - Critical
Window: next 48 hours

Heavy snow and strong wind are forecast, with the highest risk from tomorrow morning into the afternoon. This may slow travel, affect outdoor teams and create difficult road conditions.

Recommended actions:
- Warn local teams before the peak period.
- Allow extra travel time and check route plans.
- Keep monitoring conditions at the next scheduled update.
```
