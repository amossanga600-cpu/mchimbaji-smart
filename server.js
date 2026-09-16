const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DB_FILE = path.join(__dirname, "database.json");

const defaultDB = {
  users: [
    {
      id: 1,
      name: "Mmiliki",
      username: "owner",
      password: "1234",
      role: "owner"
    },
    {
      id: 2,
      name: "Msimamizi wa Shimo",
      username: "supervisor",
      password: "1234",
      role: "supervisor"
    }
  ],

  batches: [],
  fuel: [],
  expenses: [],
  dispatches: [],
  gold: [],
  sales: [],
  alerts: [],
  audit_logs: []
};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(defaultDB, null, 2)
    );
  }

  return JSON.parse(
    fs.readFileSync(DB_FILE, "utf8")
  );
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

function id(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString().slice(-8)
  );
}

function now() {
  return new Date().toISOString();
}

function audit(db, action, user, details) {
  db.audit_logs.push({
    id: id("AUD"),
    action,
    user: user || "system",
    details,
    timestamp: now()
  });
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.json({
    system: "Mchimbaji Smart",
    status: "ONLINE",
    version: "2.0",
    time: now()
  });
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

  const { username, password } = req.body;

  const db = loadDB();

  const user = db.users.find(
    u =>
      u.username === username &&
      u.password === password
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Username au password si sahihi."
    });
  }

  audit(
    db,
    "LOGIN",
    user.username,
    "Mtumiaji ameingia kwenye mfumo."
  );

  saveDB(db);

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

/* =========================
   DASHBOARD
========================= */

app.get("/api/dashboard", (req, res) => {

  const db = loadDB();

  const bagsAtMine = db.batches
    .filter(b => b.stage === "Shimoni")
    .reduce((sum, b) => sum + b.bags, 0);

  const bagsAtCrusher = db.batches
    .filter(b => b.stage === "Crusher")
    .reduce((sum, b) => sum + b.bags, 0);

  const bagsAtElution = db.batches
    .filter(b => b.stage === "Elution")
    .reduce((sum, b) => sum + b.bags, 0);

  const bagsRecovered = db.batches
    .filter(b => b.stage === "Gold Recovered")
    .reduce((sum, b) => sum + b.bags, 0);

  const expenses = db.expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const sales = db.sales.reduce(
    (sum, s) => sum + Number(s.amount || 0),
    0
  );

  const net = sales - expenses;

  res.json({
    success: true,

    oreFlow: {
      mine: bagsAtMine,
      crusher: bagsAtCrusher,
      elution: bagsAtElution,
      recovered: bagsRecovered
    },

    financial: {
      sales,
      expenses,
      net
    },

    counts: {
      batches: db.batches.length,
      fuelRecords: db.fuel.length,
      alerts: db.alerts.length
    },

    alerts: db.alerts
      .slice(-10)
      .reverse()
  });
});

/* =========================
   CREATE BATCH
========================= */

app.post("/api/batches", (req, res) => {

  const {
    pit,
    bags,
    supervisor,
    shift,
    photo
  } = req.body;

  if (!pit || !bags) {
    return res.status(400).json({
      success: false,
      message: "Shimo na idadi ya magunia vinahitajika."
    });
  }

  const db = loadDB();

  const batch = {
    lot_id: id("LOT-TZ"),
    pit,
    bags: Number(bags),
    supervisor: supervisor || "Unknown",
    shift: shift || "Mchana",
    stage: "Shimoni",

    photo: photo || null,

    created_at: now(),

    history: [
      {
        stage: "Shimoni",
        action: "Mifuko imetoka shimoni",
        timestamp: now()
      }
    ]
  };

  db.batches.push(batch);

  audit(
    db,
    "BATCH_CREATED",
    supervisor,
    `Batch ${batch.lot_id} imeanzishwa ikiwa na ${batch.bags} magunia.`
  );

  saveDB(db);

  res.json({
    success: true,
    message: "Batch imehifadhiwa.",
    batch
  });
});

/* =========================
   GET BATCHES
========================= */

app.get("/api/batches", (req, res) => {

  const db = loadDB();

  res.json({
    success: true,
    batches: db.batches
  });
});

/* =========================
   GET SINGLE BATCH
========================= */

app.get("/api/batches/:lotId", (req, res) => {

  const db = loadDB();

  const batch = db.batches.find(
    b => b.lot_id === req.params.lotId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch haijapatikana."
    });
  }

  res.json({
    success: true,
    batch
  });
});

/* =========================
   MOVE BATCH
========================= */

app.post("/api/batches/:lotId/move", (req, res) => {

  const { stage, user } = req.body;

  const allowedStages = [
    "Shimoni",
    "Crusher",
    "Elution",
    "Gold Recovered"
  ];

  if (!allowedStages.includes(stage)) {
    return res.status(400).json({
      success: false,
      message: "Stage si sahihi."
    });
  }

  const db = loadDB();

  const batch = db.batches.find(
    b => b.lot_id === req.params.lotId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch haijapatikana."
    });
  }

  const oldStage = batch.stage;

  batch.stage = stage;

  batch.history.push({
    stage,
    action: `${oldStage} → ${stage}`,
    timestamp: now()
  });

  audit(
    db,
    "TRACEABILITY",
    user || "system",
    `${batch.lot_id}: ${oldStage} → ${stage}`
  );

  saveDB(db);

  res.json({
    success: true,
    batch
  });
});

/* =========================
   FUEL
========================= */

app.post("/api/fuel", (req, res) => {

  const {
    machine,
    litres,
    hours,
    user,
    photo
  } = req.body;

  if (!machine || !litres) {
    return res.status(400).json({
      success: false,
      message: "Machine na lita vinahitajika."
    });
  }

  const db = loadDB();

  const record = {
    id: id("FUEL"),
    machine,
    litres: Number(litres),
    hours: Number(hours || 0),
    user: user || "supervisor",
    photo: photo || null,
    timestamp: now()
  };

  db.fuel.push(record);

  /*
    SIMPLE FUEL ALERT
    5L kwa saa ndiyo default demo.
  */

  if (
    record.hours > 0 &&
    record.litres > record.hours * 5
  ) {

    const alert = {
      id: id("ALERT"),
      type: "FUEL_ANOMALY",
      severity: "HIGH",

      message:
        `${machine} imetumia ${record.litres}L ` +
        `kwa ${record.hours} hours. ` +
        `Matumizi yaliyokadiriwa ni ${record.hours * 5}L.`,

      timestamp: now()
    };

    db.alerts.push(alert);
  }

  audit(
    db,
    "FUEL_LOG",
    user || "supervisor",
    `${machine}: ${litres}L`
  );

  saveDB(db);

  res.json({
    success: true,
    record
  });
});

/* =========================
   EXPENSES
========================= */

app.post("/api/expenses", (req, res) => {

  const {
    category,
    amount,
    description,
    user
  } = req.body;

  if (!category || !amount) {
    return res.status(400).json({
      success: false,
      message: "Category na amount vinahitajika."
    });
  }

  const db = loadDB();

  const expense = {
    id: id("EXP"),
    category,
    amount: Number(amount),
    description: description || "",
    user: user || "supervisor",
    timestamp: now()
  };

  db.expenses.push(expense);

  audit(
    db,
    "EXPENSE",
    user || "supervisor",
    `${category}: ${amount} TSh`
  );

  saveDB(db);

  res.json({
    success: true,
    expense
  });
});

/* =========================
   DISPATCH
========================= */

app.post("/api/dispatch", (req, res) => {

  const {
    lot_id,
    destination,
    receiver,
    user
  } = req.body;

  const db = loadDB();

  const batch = db.batches.find(
    b => b.lot_id === lot_id
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch haijapatikana."
    });
  }

  const dispatch = {
    id: id("DSP"),
    lot_id,
    destination: destination || "Crusher",
    receiver: receiver || "Processing",
    user: user || "supervisor",
    timestamp: now()
  };

  db.dispatches.push(dispatch);

  batch.stage = "Crusher";

  batch.history.push({
    stage: "Crusher",
    action: "Dispatch kutoka shimoni kwenda crusher",
    timestamp: now()
  });

  audit(
    db,
    "DISPATCH",
    user || "supervisor",
    `${lot_id} dispatched kwenda ${dispatch.destination}`
  );

  saveDB(db);

  res.json({
    success: true,
    dispatch,
    batch
  });
});

/* =========================
   GOLD RECOVERY
========================= */

app.post("/api/gold", (req, res) => {

  const {
    lot_id,
    grams,
    purity,
    user
  } = req.body;

  const db = loadDB();

  const batch = db.batches.find(
    b => b.lot_id === lot_id
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch haijapatikana."
    });
  }

  const record = {
    id: id("GOLD"),
    lot_id,
    grams: Number(grams),
    purity: Number(purity || 0),
    user: user || "owner",
    timestamp: now()
  };

  db.gold.push(record);

  batch.stage = "Gold Recovered";

  batch.history.push({
    stage: "Gold Recovered",
    action: `${grams}g gold recovered`,
    timestamp: now()
  });

  audit(
    db,
    "GOLD_RECOVERY",
    user || "owner",
    `${lot_id}: ${grams}g`
  );

  saveDB(db);

  res.json({
    success: true,
    record,
    batch
  });
});

/* =========================
   SALES
========================= */

app.post("/api/sales", (req, res) => {

  const {
    lot_id,
    grams,
    amount,
    buyer,
    user
  } = req.body;

  const db = loadDB();

  const sale = {
    id: id("SALE"),
    lot_id: lot_id || null,
    grams: Number(grams || 0),
    amount: Number(amount),
    buyer: buyer || "Buyer",
    user: user || "owner",
    timestamp: now()
  };

  db.sales.push(sale);

  audit(
    db,
    "SALE",
    user || "owner",
    `${amount} TSh`
  );

  saveDB(db);

  res.json({
    success: true,
    sale
  });
});

/* =========================
   REVENUE SPLIT
========================= */

app.post("/api/split", (req, res) => {

  const {
    revenue,
    ownerPercent = 40,
    sponsorPercent = 30,
    workersPercent = 30
  } = req.body;

  const total =
    Number(ownerPercent) +
    Number(sponsorPercent) +
    Number(workersPercent);

  if (total !== 100) {
    return res.status(400).json({
      success: false,
      message: "Percentages lazima ziwe 100%."
    });
  }

  const amount = Number(revenue);

  res.json({
    success: true,

    revenue: amount,

    split: {
      owner:
        amount * Number(ownerPercent) / 100,

      sponsor:
        amount * Number(sponsorPercent) / 100,

      workers:
        amount * Number(workersPercent) / 100
    },

    percentages: {
      owner: Number(ownerPercent),
      sponsor: Number(sponsorPercent),
      workers: Number(workersPercent)
    }
  });
});

/* =========================
   ALERTS
========================= */

app.get("/api/alerts", (req, res) => {

  const db = loadDB();

  res.json({
    success: true,
    alerts: db.alerts
      .slice()
      .reverse()
  });
});

/* =========================
   AUDIT LOG
========================= */

app.get("/api/audit", (req, res) => {

  const db = loadDB();

  res.json({
    success: true,
    logs: db.audit_logs
      .slice()
      .reverse()
  });
});

/* =========================
   DATABASE
========================= */

app.get("/api/database", (req, res) => {

  const db = loadDB();

  res.json({
    success: true,
    data: db
  });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("================================");
  console.log("  MCHIMBAJI SMART SERVER");
  console.log("================================");
  console.log(`Server: http://localhost:${PORT}`);
  console.log("Status: ONLINE");
  console.log("Database: database.json");
  console.log("================================");
  console.log("");
});
