'use strict';
const express = require('express');
const app = express();
app.use(express.json());

// ---- STATIC DATA ----

const outageData = {
  "Zone 1": { status: "operational", load: "72%", lastCheck: "2 hours ago" },
  "Zone 2": { status: "operational", load: "65%", lastCheck: "1 hour ago" },
  "Zone 3": { status: "operational", load: "80%", lastCheck: "30 minutes ago" },
  "Zone 4": { status: "outage", severity: "High", eta: "2 hours 30 minutes", cause: "Feeder fault" },
  "Zone 5": { status: "partial outage", severity: "Low", eta: "45 minutes", cause: "Scheduled maintenance" },
  "Substation Alpha": { status: "operational", load: "78%", lastCheck: "6 hours ago" },
  "Substation Beta": { status: "operational", load: "55%", lastCheck: "3 hours ago" }
};

const equipmentData = {
  "Transformer T-12": { status: "fault", issue: "Overheating at 95 degrees C", action: "Isolate immediately" },
  "Transformer T-07": { status: "operational", load: "70%", temp: "65 degrees C" },
  "Feeder Line B-7": { status: "undervoltage", reading: "118 kV", nominal: "132 kV" },
  "Generator G-3": { status: "standby", fuel: "87%", readiness: "Ready to deploy" },
  "Switchgear SW-4": { status: "operational", lastTest: "7 days ago" },
  "Pump Station P-1": { status: "operational", flow: "Normal", pressure: "4.2 bar" }
};

const contactData = {
  "Current Shift": { supervisor: "Ahmed Karim", extension: "4412" },
  "Morning Shift": { supervisor: "Maria Santos", extension: "4401" },
  "Evening Shift": { supervisor: "Nikos Papadopoulos", extension: "4407" },
  "Night Shift": { supervisor: "Elena Volkov", extension: "4415" },
  "Safety Officer": { name: "James Osei", extension: "4430" },
  "Maintenance Team": { lead: "Yusuf Al-Rashid", extension: "4420" },
  "Emergency Hotline": { number: "0800-GRIDGUARD" }
};

const weatherData = {
  alerts: [{ type: "High Wind", severity: "Yellow", detail: "70 km/h gusts expected until 22:00", action: "Secure outdoor equipment" }],
  conditions: { temp: "18C", wind: "45 km/h", visibility: "Good" }
};

const shiftData = {
  "Current Shift": { type: "Evening", start: "14:00", end: "22:00", crew: 8, supervisor: "Nikos Papadopoulos" },
  "Morning Shift": { type: "Morning", start: "06:00", end: "14:00", crew: 6, supervisor: "Maria Santos" },
  "Evening Shift": { type: "Evening", start: "14:00", end: "22:00", crew: 8, supervisor: "Nikos Papadopoulos" },
  "Night Shift": { type: "Night", start: "22:00", end: "06:00", crew: 4, supervisor: "Elena Volkov" }
};

const procedureData = {
  "Evacuation": "Step 1: Sound the evacuation alarm. Step 2: Direct all personnel to the nearest muster point. Step 3: Account for all staff using the shift roster.",
  "Transformer Fire": "Step 1: Isolate the transformer using the manual disconnect switch. Step 2: Activate the CO2 suppression system. Step 3: Contact the fire brigade.",
  "Gas Leak Response": "Step 1: Evacuate the affected area immediately. Step 2: Do not use any electrical switches. Step 3: Call the gas emergency line.",
  "Electrical Isolation": "Step 1: Identify the correct isolation point on the single-line diagram. Step 2: Apply lockout and tagout. Step 3: Verify isolation using a voltage tester.",
  "Flood Response": "Step 1: Isolate all electrical equipment in the flood zone. Step 2: Activate the sump pumps. Step 3: Notify the facility manager.",
  "First Aid": "Step 1: Make sure the scene is safe before approaching. Step 2: Call the on-site first aider on Extension 4430. Step 3: Do not move the injured person unless in immediate danger."
};

const manualData = {
  "Transformer T-12": "Manual reference TM-T12-v4. Section 3 covers operation. Section 7 covers fault isolation. Digital copy in /manuals/transformers/",
  "Transformer T-07": "Manual reference TM-T07-v3. Section 3 covers operation. Section 7 covers fault isolation. Digital copy in /manuals/transformers/",
  "Generator G-3": "Manual reference GM-G3-v2. Section 4 covers startup procedure. Section 9 covers emergency shutdown. Digital copy in /manuals/generators/",
  "Feeder Line B-7": "Manual reference FL-B7-v1. Section 2 covers voltage parameters. Section 5 covers fault recovery. Digital copy in /manuals/feeders/",
  "Switchgear SW-4": "Manual reference SW-SW4-v3. Section 6 covers maintenance schedule. Digital copy in /manuals/switchgear/",
  "Pump Station P-1": "Manual reference PS-P1-v2. Section 3 covers operating pressure. Digital copy in /manuals/pumps/"
};

// ---- SESSION STATE ----

let lastResponse = 'No previous response to repeat.';

// ---- HELPERS ----

function reply(res, text) {
  lastResponse = text;
  res.json({ fulfillmentText: text });
}

function extractParam(params, key) {
  const val = params[key];
  return Array.isArray(val) ? val[0] : val;
}

// ---- WEBHOOK HANDLER ----

app.post('/webhook', (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  if (intent === 'outage-status') {
    const zone = extractParam(params, 'zone');
    if (zone && outageData[zone]) {
      const d = outageData[zone];
      if (d.status === 'outage') {
        reply(res, 'Active outage in ' + zone + '. Severity: ' + d.severity + '. ETA: ' + d.eta + '. Cause: ' + d.cause + '. Do you want to log an incident?');
      } else if (d.status === 'partial outage') {
        reply(res, zone + ' has a partial outage. Severity: ' + d.severity + '. ETA: ' + d.eta + '. Cause: ' + d.cause + '.');
      } else {
        reply(res, zone + ' is operational. Load: ' + d.load + '. Last checked: ' + d.lastCheck + '.');
      }
    } else {
      const active = Object.keys(outageData).filter(k => outageData[k].status !== 'operational').map(k => k + ': ' + outageData[k].status + ', ETA ' + outageData[k].eta);
      reply(res, active.length > 0 ? 'Active outages: ' + active.join('. ') + '.' : 'No active outages. All zones operational.');
    }

  } else if (intent === 'outage-status - report-incident') {
    const zone = extractParam(params, 'zone') || 'the affected zone';
    const type = extractParam(params, 'incident-type') || 'Power Outage';
    const id = 'INC-' + Math.floor(1000 + Math.random() * 9000);
    const time = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    reply(res, 'Incident logged. ID: ' + id + '. Location: ' + zone + '. Type: ' + type + '. Severity: High. Time: ' + time + '.');

  } else if (intent === 'equipment-status') {
    const eq = extractParam(params, 'equipment-id');
    if (eq && equipmentData[eq]) {
      const d = equipmentData[eq];
      if (d.status === 'fault') {
        reply(res, 'Alert: ' + eq + ' fault. Issue: ' + d.issue + '. Action: ' + d.action + '.');
      } else if (d.status === 'undervoltage') {
        reply(res, eq + ' undervoltage. Reading: ' + d.reading + '. Nominal: ' + d.nominal + '.');
      } else {
        reply(res, eq + ' is ' + d.status + '.');
      }
    } else {
      reply(res, 'Please specify an equipment ID such as Transformer T-12 or Generator G-3.');
    }

  } else if (intent === 'incident-reporting') {
    const zone = extractParam(params, 'zone');
    const type = extractParam(params, 'incident-type');
    const severity = extractParam(params, 'severity') || 'Medium';
    const id = 'INC-' + Math.floor(1000 + Math.random() * 9000);
    const time = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    reply(res, 'Incident logged. ID: ' + id + '. Location: ' + zone + '. Type: ' + type + '. Severity: ' + severity + '. Time: ' + time + '.');

  } else if (intent === 'emergency-procedures') {
    const rawType = extractParam(params, 'procedure-type');
    const type = Object.keys(procedureData).find(k => k.toLowerCase() === (rawType || '').toLowerCase());
    reply(res, type ? procedureData[type] : 'Please specify: Evacuation, Transformer Fire, Gas Leak Response, Electrical Isolation, Flood Response, or First Aid.');

  } else if (intent === 'emergency-procedures - next-step') {
    reply(res, 'Step 2: Activate the CO2 suppression system if available. Step 3: Contact emergency services. Follow your site evacuation plan. Do you need me to repeat any step?');

  } else if (intent === 'resource-availability') {
    reply(res, 'Available resources: Generator G-3 on standby, fuel 87%. Three maintenance technicians on call. One spare transformer in storage. Emergency vehicle available.');

  } else if (intent === 'contact-directory') {
    const shift = extractParam(params, 'shift-period') || 'Current Shift';
    const d = contactData[shift];
    if (d) {
      const name = d.supervisor || d.name || d.lead;
      reply(res, shift + ': ' + name + '. Extension: ' + d.extension + '.');
    } else {
      reply(res, 'Current supervisor: ' + contactData['Current Shift'].supervisor + '. Extension: ' + contactData['Current Shift'].extension + '. Emergency hotline: ' + contactData['Emergency Hotline'].number + '.');
    }

  } else if (intent === 'safety-protocols') {
    const zone = extractParam(params, 'zone');
    const z = zone ? ' for ' + zone : '';
    reply(res, 'Safety protocols' + z + ': 1) Wear correct PPE. 2) Apply lockout and tagout before maintenance. 3) Never enter high voltage areas alone. 4) Report all hazards immediately.');

  } else if (intent === 'weather-alerts') {
    if (weatherData.alerts.length > 0) {
      const a = weatherData.alerts[0];
      reply(res, 'Weather alert: ' + a.type + '. Severity: ' + a.severity + '. ' + a.detail + '. Action: ' + a.action + '.');
    } else {
      const c = weatherData.conditions;
      reply(res, 'No active alerts. Conditions: ' + c.temp + ', wind ' + c.wind + ', visibility ' + c.visibility + '.');
    }

  } else if (intent === 'shift-information') {
    const shift = extractParam(params, 'shift-period') || 'Current Shift';
    const d = shiftData[shift] || shiftData['Current Shift'];
    reply(res, shift + ': ' + d.type + ' shift. ' + d.start + ' to ' + d.end + '. Crew: ' + d.crew + '. Supervisor: ' + d.supervisor + '.');

  } else if (intent === 'equipment-manuals') {
    const eq = extractParam(params, 'equipment-id');
    reply(res, manualData[eq] || 'Manual not found. Contact maintenance on Extension 4420.');

  } else if (intent === 'repeat-last') {
    reply(res, lastResponse);

  } else {
    reply(res, 'Query not recognised. I can help with outages, equipment, incidents, emergency procedures, contacts, safety, weather, shift info, or manuals.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GridGuard fulfillment running on port ' + PORT));
