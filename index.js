'use strict';

const express = require('express');
const path = require('path');
const { Readable } = require('stream');

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Allow cross-origin requests so the web interface can call this server
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// -------------------------------------------------------
// Static data - simulates what a real SCADA (supervisory control and data access) system would return
// -------------------------------------------------------

const outageData = {
  "Zone 1":          { status: "operational",    load: "72%",  lastCheck: "2 hours ago" },
  "Zone 2":          { status: "operational",    load: "65%",  lastCheck: "1 hour ago" },
  "Zone 3":          { status: "operational",    load: "80%",  lastCheck: "30 minutes ago" },
  "Zone 4":          { status: "outage",         severity: "High", eta: "2 hours 30 minutes", cause: "Feeder fault" },
  "Zone 5":          { status: "partial outage", severity: "Low",  eta: "45 minutes",         cause: "Scheduled maintenance" },
  "Substation Alpha":{ status: "operational",    load: "78%",  lastCheck: "6 hours ago" },
  "Substation Beta": { status: "operational",    load: "55%",  lastCheck: "3 hours ago" }
};

const equipmentData = {
  "Transformer T-12": { status: "fault",         issue: "Overheating at 95 degrees C", action: "Isolate immediately" },
  "Transformer T-07": { status: "operational",   load: "70%",   temp: "65 degrees C" },
  "Feeder Line B-7":  { status: "undervoltage",  reading: "118 kV", nominal: "132 kV" },
  "Generator G-3":    { status: "standby",       fuel: "87%",   readiness: "Ready to deploy" },
  "Switchgear SW-4":  { status: "operational",   lastTest: "7 days ago" },
  "Pump Station P-1": { status: "operational",   flow: "Normal", pressure: "4.2 bar" }
};

const contactData = {
  "Current Shift":    { supervisor: "Stavros Apostolou",    extension: "4412" },
  "Morning Shift":    { supervisor: "Kostas Mpampiniotis",  extension: "4401" },
  "Evening Shift":    { supervisor: "Nikos Papadopoulos",   extension: "4407" },
  "Night Shift":      { supervisor: "George Xirogiannis",   extension: "4415" },
  "Safety Officer":   { name: "Andreas Apazidis",           extension: "4430" },
  "Maintenance Team": { lead: "Mama Mia",                   extension: "4420" },
  "Emergency Hotline":{ number: "0800-GRIDGUARD" }
};

const weatherData = {
  alerts: [
    { type: "High Wind", severity: "Yellow", detail: "70 km/h gusts expected until 22:00", action: "Secure outdoor equipment" }
  ],
  conditions: { temp: "18C", wind: "45 km/h", visibility: "Good" }
};

const shiftData = {
  "Current Shift": { type: "Evening", start: "14:00", end: "22:00", crew: 8, supervisor: "Nikos Papadopoulos" },
  "Morning Shift": { type: "Morning", start: "06:00", end: "14:00", crew: 6, supervisor: "Maria Santos" },
  "Evening Shift": { type: "Evening", start: "14:00", end: "22:00", crew: 8, supervisor: "Nikos Papadopoulos" },
  "Night Shift":   { type: "Night",   start: "22:00", end: "06:00", crew: 4, supervisor: "Elena Volkov" }
};

const procedureData = {
  "Evacuation":           "Step 1: Sound the evacuation alarm. Step 2: Direct all personnel to the nearest muster point. Step 3: Account for all staff using the shift roster. Ready for Step 2?",
  "Transformer Fire":     "Step 1: Isolate the transformer using the manual disconnect switch. Step 2: Activate the CO2 suppression system. Step 3: Contact the fire brigade. Ready for Step 2?",
  "Gas Leak Response":    "Step 1: Evacuate the affected area immediately. Step 2: Do not use any electrical switches. Step 3: Call the gas emergency line. Ready for Step 2?",
  "Electrical Isolation": "Step 1: Identify the correct isolation point on the single-line diagram. Step 2: Apply lockout and tagout. Step 3: Verify isolation using a voltage tester. Ready for Step 2?",
  "Flood Response":       "Step 1: Isolate all electrical equipment in the flood zone. Step 2: Activate the sump pumps.Step 3: Notify the facility manager. Ready for Step 2?",
  "First Aid":            "Step 1: Make sure the scene is safe before approaching. Step 2: Call the on-site first aider on Extension 4430. Step 3: Do not move the injured person unless in immediate danger. Ready for Step 2?"
};

const manualData = {
  "Transformer T-12": "Manual reference TM-T12-v4. Section 3 covers operation. Section 7 covers fault isolation. Digital copy in /manuals/transformers/",
  "Transformer T-07": "Manual reference TM-T07-v3. Section 3 covers operation. Section 7 covers fault isolation. Digital copy in /manuals/transformers/",
  "Generator G-3":    "Manual reference GM-G3-v2. Section 4 covers startup procedure. Section 9 covers emergency shutdown. Digital copy in /manuals/generators/",
  "Feeder Line B-7":  "Manual reference FL-B7-v1. Section 2 covers voltage parameters. Section 5 covers fault recovery. Digital copy in /manuals/feeders/",
  "Switchgear SW-4":  "Manual reference SW-SW4-v3. Section 6 covers maintenance schedule. Digital copy in /manuals/switchgear/",
  "Pump Station P-1": "Manual reference PS-P1-v2. Section 3 covers operating pressure. Digital copy in /manuals/pumps/"
};

// -------------------------------------------------------
// Session state
// -------------------------------------------------------

// Stores the last response so the repeat-last intent can retrieve it
var lastResponse = 'No previous response stored.';

// -------------------------------------------------------
// Helper functions
// -------------------------------------------------------

// Sends a fulfillment response back to Dialogflow and saves it for repeat
function sendReply(res, text) {
  lastResponse = text;
  res.json({ fulfillmentText: text });
}

// Dialogflow sometimes sends entity values as arrays even for single values
// This function handles both cases and always returns a plain string
function getParam(params, key) {
  var value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

// -------------------------------------------------------
// Dialogflow detect intent (used by the web interface /chat endpoint)
// -------------------------------------------------------

async function callDialogflow(userText, sessionId) {
  var credentialsRaw = process.env.GOOGLE_CREDENTIALS;
  var projectId = process.env.DIALOGFLOW_PROJECT_ID;

  if (!credentialsRaw || !projectId) {
    throw new Error('Missing GOOGLE_CREDENTIALS or DIALOGFLOW_PROJECT_ID env');
  }

  const { GoogleAuth } = require('google-auth-library');
  var credentials = JSON.parse(credentialsRaw);
  var auth = new GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/dialogflow']
  });

  var accessToken = await auth.getAccessToken();

  // Using the europe-west1 regional endpoint since the agent is deployed there
  var url = 'https://europe-west1-dialogflow.googleapis.com/v2/projects/' + projectId +
            '/locations/europe-west1/agent/sessions/' + sessionId + ':detectIntent';

  var response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      queryInput: {
        text: {
          text: userText,
          languageCode: 'en'
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error('Dialogflow API error: ' + await response.text());
  }

  return response.json();
}

// -------------------------------------------------------
// Claude enhancement (makes responses sound more natural)
// This is part of the out-of-scope bonus web interface, the setup follows anthropic's docs
// -------------------------------------------------------

async function enhanceWithClaude(fulfillmentText) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // If no API key is set, just return the original text
    return fulfillmentText;
  }

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You are GridGuard, a voice assistant for an energy utility control room. Rephrase the text below to sound more natural while keeping all facts identical. Use a calm, professional tone. No greetings, no filler phrases. Output only the rephrased text.',
      messages: [{ role: 'user', content: fulfillmentText }]
    })
  });

  if (!response.ok) {
    return fulfillmentText;
  }

  var data = await response.json();
  return data.content[0].text || fulfillmentText;
}

// -------------------------------------------------------
// /chat endpoint used by the bonus web interface
// Sends user text to Dialogflow, then optionally enhances with Claude
// -------------------------------------------------------

app.post('/chat', async function(req, res) {
  var userText = req.body.text;
  var sessionId = req.body.sessionId || 'web-session-001';

  if (!userText) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    var dfResult = await callDialogflow(userText, sessionId);
    var rawResponse = dfResult.queryResult.fulfillmentText ||
                      'Query not recognised. I can help with outages, equipment, incidents, emergency procedures, contacts, safety, weather, shift info, or manuals.';
    var intentName = dfResult.queryResult.intent.displayName || 'unknown';

    // Short prompt questions (under 20 words ending in ?) do not need Claude enhancement
    // because they are already phrased correctly and Claude tends to over-elaborate them
    // for example it would sometimes turn a 5-word response into a 22+ words response, breaking
    // the tone of voice requirements and the persona definition
    var wordCount = rawResponse.split(' ').length;
    var isShortPrompt = rawResponse.endsWith('?') && wordCount < 20;

    var finalResponse;
    if (isShortPrompt) {
      finalResponse = rawResponse;
    } else {
      finalResponse = await enhanceWithClaude(rawResponse);
    }

    res.json({ response: finalResponse, intent: intentName, raw: rawResponse });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// /tts endpoint - converts text to speech using Azure
// Part of the bonus web interface
// -------------------------------------------------------

app.post('/tts', async function(req, res) {
  var text = req.body.text;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  var azureKey = process.env.AZURE_TTS_KEY;
  var azureRegion = process.env.AZURE_TTS_REGION;

  // If Azure credentials are not set, tell the client to use the browser TTS fallback
  if (!azureKey || !azureRegion) {
    return res.status(200).json({ fallback: true });
  }

  try {
    // SSML lets us control the voice speed and pitch
    var ssml = "<speak version='1.0' xml:lang='en-US'>" +
               "<voice name='en-US-AndrewMultilingualNeural'>" +
               "<prosody rate='+10%' pitch='-3%'>" +
               text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
               "</prosody></voice></speak>";

    var ttsResponse = await fetch(
      'https://' + azureRegion + '.tts.speech.microsoft.com/cognitiveservices/v1',
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
        },
        body: ssml
      }
    );

    if (!ttsResponse.ok) {
      console.error('Azure TTS error:', await ttsResponse.text());
      return res.status(200).json({ fallback: true });
    }

    // Stream the audio directly to the client instead of buffering it first
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    Readable.fromWeb(ttsResponse.body).pipe(res);

  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(200).json({ fallback: true });
  }
});

// -------------------------------------------------------
// /status endpoint - returns data for the web interface status panels
// -------------------------------------------------------

app.get('/status', function(req, res) {
  res.json({ outageData, equipmentData, weatherData, shiftData });
});

// -------------------------------------------------------
// /webhook endpoint - main Dialogflow fulfillment handler
// Dialogflow calls this after it classifies an intent
// -------------------------------------------------------

app.post('/webhook', function(req, res) {
  var intent = req.body.queryResult.intent.displayName;
  var params = req.body.queryResult.parameters;

  // ---- Outage Status ----
  if (intent === 'outage-status') {
    var zone = getParam(params, 'zone');

    if (zone && outageData[zone]) {
      var zoneData = outageData[zone];
      if (zoneData.status === 'outage') {
        sendReply(res, 'Active outage in ' + zone + '. Severity: ' + zoneData.severity + '. ETA: ' + zoneData.eta + '. Cause: ' + zoneData.cause + '. Do you want to log an incident?');
      } else if (zoneData.status === 'partial outage') {
        sendReply(res, zone + ' has a partial outage. Severity: ' + zoneData.severity + '. ETA: ' + zoneData.eta + '. Cause: ' + zoneData.cause + '.');
      } else {
        sendReply(res, zone + ' is operational. Load: ' + zoneData.load + '. Last checked: ' + zoneData.lastCheck + '.');
      }
    } else {
      // No zone specified - return all active outages
      var activeOutages = [];
      for (var z in outageData) {
        if (outageData[z].status !== 'operational') {
          activeOutages.push(z + ': ' + outageData[z].status + ', ETA ' + outageData[z].eta);
        }
      }
      if (activeOutages.length > 0) {
        sendReply(res, 'Active outages: ' + activeOutages.join('. ') + '.');
      } else {
        sendReply(res, 'No active outages. All zones operational.');
      }
    }

  // ---- Report Incident (follow-up after outage query) ----
  } else if (intent === 'outage-status - report-incident') {
    var zone = getParam(params, 'zone') || 'the affected zone';
    var incidentType = getParam(params, 'incident-type') || 'Power Outage';
    var incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);
    var timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    sendReply(res, 'Incident logged. ID: ' + incidentId + '. Location: ' + zone + '. Type: ' + incidentType + '. Severity: High. Time: ' + timestamp + '.');

  // ---- Equipment Status ----
  } else if (intent === 'equipment-status') {
    var equipId = getParam(params, 'equipment-id');

    if (equipId && equipmentData[equipId]) {
      var equip = equipmentData[equipId];
      if (equip.status === 'fault') {
        sendReply(res, 'Alert: ' + equipId + ' fault. Issue: ' + equip.issue + '. Action: ' + equip.action + '.');
      } else if (equip.status === 'undervoltage') {
        sendReply(res, equipId + ' undervoltage. Reading: ' + equip.reading + '. Nominal: ' + equip.nominal + '.');
      } else {
        sendReply(res, equipId + ' is ' + equip.status + '.');
      }
    } else {
      sendReply(res, 'Please specify an equipment ID such as Transformer T-12 or Generator G-3.');
    }

  // ---- Incident Reporting ----
  } else if (intent === 'incident-reporting') {
    var zone = getParam(params, 'zone');
    var incidentType = getParam(params, 'incident-type');

    // Guard: if required parameters are missing, prompt for them
    // Native Dialogflow slot filling was not working reliably so this is handled here
    if (!zone) {
      return sendReply(res, 'Which zone is the incident in?');
    }
    if (!incidentType) {
      return sendReply(res, 'What type of incident? Power Outage, Equipment Fault, Gas Leak, Fire, Flooding, or Safety Breach.');
    }

    var severity = getParam(params, 'severity') || 'Medium';
    var incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);
    var timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    sendReply(res, 'Incident logged. ID: ' + incidentId + '. Location: ' + zone + '. Type: ' + incidentType + '. Severity: ' + severity + '. Time: ' + timestamp + '.');

  // ---- Emergency Procedures ----
  } else if (intent === 'emergency-procedures') {
    var procedureType = getParam(params, 'procedure-type');

    // If the operator did not specify a procedure type, check whether an incident
    // was just logged - if so we can infer the relevant procedure from the context
    if (!procedureType) {
      var activeContexts = req.body.queryResult.outputContexts || [];
      for (var i = 0; i < activeContexts.length; i++) {
        if (activeContexts[i].name && activeContexts[i].name.includes('incident-context')) {
          var ctxParams = activeContexts[i].parameters;
          var loggedType = getParam(ctxParams, 'incident-type');
          if (loggedType) {
            loggedType = loggedType.toLowerCase();
            // Map incident types to the matching procedure
            if (loggedType === 'fire' || loggedType === 'transformer fire') {
              procedureType = 'Transformer Fire';
            } else if (loggedType === 'gas leak') {
              procedureType = 'Gas Leak Response';
            } else if (loggedType === 'flooding') {
              procedureType = 'Flood Response';
            } else if (loggedType === 'power outage') {
              procedureType = 'Evacuation';
            } else if (loggedType === 'equipment fault') {
              procedureType = 'Electrical Isolation';
            } else if (loggedType === 'safety breach') {
              procedureType = 'Evacuation';
            }
          }
          break;
        }
      }
    }

    if (!procedureType) {
      return sendReply(res, 'Which procedure? Evacuation, Transformer Fire, Gas Leak Response, Electrical Isolation, Flood Response, or First Aid.');
    }

    // Find the procedure - case insensitive match
    var matchedProcedure = null;
    var procedureKeys = Object.keys(procedureData);
    for (var i = 0; i < procedureKeys.length; i++) {
      if (procedureKeys[i].toLowerCase() === procedureType.toLowerCase()) {
        matchedProcedure = procedureData[procedureKeys[i]];
        break;
      }
    }

    if (matchedProcedure) {
      sendReply(res, matchedProcedure);
    } else {
      sendReply(res, 'Which procedure? Evacuation, Transformer Fire, Gas Leak Response, Electrical Isolation, Flood Response, or First Aid.');
    }

  // ---- Emergency Procedure Next Step ----
  } else if (intent === 'emergency-procedures - next-step') {
    sendReply(res, 'Step 2: Activate the CO2 suppression system if available. Step 3: Contact emergency services. Follow your site evacuation plan. Say the next step number if you need it again.');

  // ---- Resource Availability ----
  } else if (intent === 'resource-availability') {
    sendReply(res, 'Available resources: Generator G-3 on standby, fuel 87%. Three maintenance technicians on call. One spare transformer in storage. Emergency vehicle available.');

  // ---- Contact Directory ----
  } else if (intent === 'contact-directory') {
    var shiftPeriod = getParam(params, 'shift-period') || 'Current Shift';
    var contact = contactData[shiftPeriod];

    if (contact) {
      if (contact.number) {
        // Emergency Hotline returns a phone number, not a name
        sendReply(res, 'Emergency hotline: ' + contact.number + '.');
      } else {
        var contactName = contact.supervisor || contact.name || contact.lead;
        sendReply(res, shiftPeriod + ': ' + contactName + '. Extension: ' + contact.extension + '.');
      }
    } else {
      // Default: return current shift supervisor and hotline
      var current = contactData['Current Shift'];
      var hotline = contactData['Emergency Hotline'];
      sendReply(res, 'Current supervisor: ' + current.supervisor + '. Extension: ' + current.extension + '. Emergency hotline: ' + hotline.number + '.');
    }

  // ---- Safety Protocols ----
  } else if (intent === 'safety-protocols') {
    var zone = getParam(params, 'zone');
    var zoneText = zone ? ' for ' + zone : '';
    sendReply(res, 'Safety protocols' + zoneText + ': 1) Wear correct PPE. 2) Apply lockout and tagout before maintenance. 3) Never enter high voltage areas alone. 4) Report all hazards immediately.');

  // ---- Weather Alerts ----
  } else if (intent === 'weather-alerts') {
    if (weatherData.alerts.length > 0) {
      var alert = weatherData.alerts[0];
      sendReply(res, 'Weather alert: ' + alert.type + '. Severity: ' + alert.severity + '. ' + alert.detail + '. Action: ' + alert.action + '.');
    } else {
      var conditions = weatherData.conditions;
      sendReply(res, 'No active alerts. Conditions: ' + conditions.temp + ', wind ' + conditions.wind + ', visibility ' + conditions.visibility + '.');
    }

  // ---- Shift Information ----
  } else if (intent === 'shift-information') {
    var shiftPeriod = getParam(params, 'shift-period') || 'Current Shift';
    var shift = shiftData[shiftPeriod] || shiftData['Current Shift'];
    sendReply(res, shiftPeriod + ': ' + shift.type + ' shift. ' + shift.start + ' to ' + shift.end + '. Crew: ' + shift.crew + '. Supervisor: ' + shift.supervisor + '.');

  // ---- Equipment Manuals ----
  } else if (intent === 'equipment-manuals') {
    var equipId = getParam(params, 'equipment-id');
    if (!equipId) {
      return sendReply(res, 'Which equipment? For example T-12, Generator G-3, or Feeder B-7.');
    }
    var manual = manualData[equipId];
    if (manual) {
      sendReply(res, manual);
    } else {
      sendReply(res, 'Manual not found. Contact maintenance on Extension 4420.');
    }

  // ---- Repeat Last Response ----
  } else if (intent === 'repeat-last') {
    sendReply(res, lastResponse);

  // ---- Agent Capabilities ----
  } else if (intent === 'agent-capabilities') {
    sendReply(res, 'I can help with ten query types: outage status, equipment status, incident reporting, emergency procedures, resource availability, contact directory, safety protocols, weather alerts, shift information, and equipment manuals. Which do you need?');

  // ---- Fallback ----
  } else {
    sendReply(res, 'Query not recognised. I can help with outages, equipment, incidents, emergency procedures, contacts, safety, weather, shift info, or manuals.');
  }
});

// -------------------------------------------------------
// Start server
// -------------------------------------------------------

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('GridGuard fulfillment server running on port ' + PORT);
});
