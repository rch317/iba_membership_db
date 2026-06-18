const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("node:path");
const { createMembersRouter } = require("./routes/members");

function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function createApp(options) {
  const db = options && options.db;
  const getMongoClient = options && options.getMongoClient;
  const getMongoReady = options && options.getMongoReady;
  const dbName = (options && options.dbName) || "membership";
  const readOnlyMode = envFlag("READ_ONLY_MODE", false);

  if (!db) {
    throw new Error("createApp requires a MongoDB db instance.");
  }

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "upgrade-insecure-requests": null
        }
      }
    })
  );
  app.use(morgan("dev"));
  app.use(express.json());

  const publicDir = path.join(__dirname, "public");
  
  // Middleware: if requesting /members with Accept: text/html (browser), serve HTML
  app.get("/members", (req, res, next) => {
    const acceptsHtml = (req.accepts && req.accepts("html")) || req.headers.accept?.includes("text/html");
    if (acceptsHtml && Object.keys(req.query).length === 0) {
      return res.sendFile(path.join(publicDir, "members.html"));
    }
    next();
  });

  // Register API routes
  app.use("/members", createMembersRouter(db, { readOnlyMode }));

  app.use(
    express.static(publicDir, {
      etag: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".css") || filePath.endsWith(".js") || filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    })
  );

  app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
  });

  app.get("/satellite-groups", (req, res) => {
    res.sendFile(path.join(publicDir, "satellite-groups.html"));
  });

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "iba-membership-api", readOnlyMode });
  });

  app.get("/health/ready", (req, res) => {
    const ready = typeof getMongoReady === "function" ? getMongoReady() : true;

    if (!ready) {
      return res.status(503).json({ status: "not-ready", mongo: "disconnected" });
    }

    return res.status(200).json({ status: "ready", mongo: "connected" });
  });

  app.get("/health/mongo", async (req, res) => {
    const client = typeof getMongoClient === "function" ? getMongoClient() : null;
    if (!client) {
      return res.status(503).json({ status: "error", mongo: "client-not-initialized" });
    }

    try {
      await client.db(dbName).command({ ping: 1 });
      return res.status(200).json({ status: "ok", mongo: "reachable" });
    } catch (error) {
      return res.status(503).json({ status: "error", mongo: error.message });
    }
  });

  app.get("/config.js", (req, res) => {
    const featureFlags = {
      themeResetEnabled: envFlag("FEATURE_THEME_RESET_ENABLED", true)
    };

    res.type("application/javascript");
    res.send(`window.__FEATURE_FLAGS__ = ${JSON.stringify(featureFlags)};`);
  });

  return app;
}

module.exports = { createApp };