const express = require("express"); 
const msal = require("@azure/msal-node");
const jwt = require("jsonwebtoken");
const session = require("express-session"); 
require("dotenv").config();

// Create MSAL configuration object
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

// Create msal application object
const pca = new msal.ConfidentialClientApplication(msalConfig); 

// Create Express App and set view engine as EJS 
const app = express();
app.set("view engine", "ejs");

// Create session middleware to store session data between HTTP requests
app.use(
  session({
    secret: "your_secret", // Replace with a real secret when deploying to production environment 
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

// Redirect to Azure Entra ID login page
app.get("/login", async (req, res) => {
  try {
    const authCodeUrlParameters = {
      scopes: ["user.read"],
      redirectUri: process.env.DEV_REDIRECT_URI,
    };
    const loginUrl = await pca.getAuthCodeUrl(authCodeUrlParameters); 
    res.redirect(loginUrl); 
  } catch (error) {
    console.error(error);
    res.status(500).send("Error building auth code URL");
  }
});

// Handle Azure Entra redirect with authorization code
app.get("/redirect", async (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: ["user.read"],
    redirectUri: process.env.DEV_REDIRECT_URI,
  };

  try {
    const response = await pca.acquireTokenByCode(tokenRequest);
    req.session.isAuthenticated = true;
    req.session.user = jwt.decode(response.idToken);
    console.log("Decoded access Token:", req.session.user);
    console.log("session:", req.session);
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

// Sign out route
app.get("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error during sign out.");
    }

    // Determine the post logout redirect URI based on the environment
    const postLogoutRedirectUri = process.env.DEV_URI;

    // Redirect to Azure Entra ID logout URL
    const tenantId = process.env.AZURE_TENANT_ID;
    const logoutUri = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutRedirectUri}`;
    res.redirect(logoutUri);
  });
});


// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));


// Reference: https://github.com/ariyaHub/ms-identity-node/blob/main/index.js
//            https://medium.com/@ariyakluankloi/quickstart-sign-in-users-and-get-an-access-token-in-a-node-web-app-using-the-auth-code-flow-81e74492741e