const express = require("express");
const ejs = require("ejs");
const msal = require("@azure/msal-node");
const jwt = require("jsonwebtoken");
const session = require("express-session");
require("dotenv").config();

const app = express();
app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SESSION_SECRET || "local_default_secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Verbose,
    },
  },
};

const pca = new msal.ConfidentialClientApplication(msalConfig);

function getRedirectUri() {
  return process.env.NODE_ENV === "production"
    ? process.env.PROD_REDIRECT_URI
    : process.env.DEV_REDIRECT_URI || "http://localhost:3000/redirect";
}

app.get("/", (req, res) => {
  res.render("index", {
    isAuthenticated: req.session.isAuthenticated,
    user: req.session.user || null,
  });
});

app.get("/login", async (req, res) => {
  try {
    const authCodeUrlParameters = {
      scopes: ["user.read"],
      redirectUri: getRedirectUri(),
    };
    const loginUrl = await pca.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(loginUrl);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error building auth code URL");
  }
});

app.get("/redirect", async (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: ["user.read"],
    redirectUri: getRedirectUri(),
  };

  try {
    const response = await pca.acquireTokenByCode(tokenRequest);
    req.session.isAuthenticated = true;
    req.session.user = jwt.decode(response.accessToken);
    res.redirect("/");
  } catch (error) {
    console.error(error);
    if (error.name === "ClientAuthError") {
      res.status(401).send("Authentication failed. Please try to login again.");
    } else {
      res.status(500).send("Error acquiring token");
    }
  }
});

app.get("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error during sign out.");
    }
    res.redirect("/");
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
