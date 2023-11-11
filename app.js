const express = require("express");
const ejs = require("ejs");
const msal = require("@azure/msal-node");
const jwt = require("jsonwebtoken");
const session = require("express-session"); // Install express-session package
require("dotenv").config();

// MSAL config
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

const app = express();
app.set("view engine", "ejs");

// Enable sessions
app.use(
  session({
    secret: "your_secret", // Replace with a real secret in production
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using https
  })
);

// Main page route
app.get("/", (req, res) => {
  if (req.session.isAuthenticated) {
    // User is authenticated, show profile
    res.render("index", { isAuthenticated: true, user: req.session.user });
  } else {
    // User is not authenticated, show sign-in button
    res.render("index", { isAuthenticated: false, user: null });
  }
});

// Redirect to Azure AD login page
app.get("/login", (req, res) => {
  const authCodeUrlParameters = {
    scopes: ["user.read"],
    redirectUri: "http://localhost:3000/redirect",
  };

  // Get URL to sign users in and consent to your app
  pca
    .getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      res.redirect(response);
    })
    .catch((error) => console.log(JSON.stringify(error)));
});

// Handle Azure AD redirect with authorization code
app.get("/redirect", (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: ["user.read"],
    redirectUri: "http://localhost:3000/redirect",
  };

  pca
    .acquireTokenByCode(tokenRequest)
    .then((response) => {
      req.session.isAuthenticated = true;
      req.session.user = jwt.decode(response.accessToken);
      res.redirect("/"); // Redirect to main page
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
});

app.get("/profile", (req, res) => {
  const token = req.query.token;
  if (token) {
    // Decode the token to get the user's profile information
    const decodedToken = jwt.decode(token);
    res.render("profile", { user: decodedToken });
  } else {
    res.redirect("/login");
  }
});

// Sign out route
app.get("/signout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/"); // Redirect to main page after signing out
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
