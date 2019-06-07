// Needed for authentication
const express = require('express');
const passport = require('passport');
const cookieSession = require('cookie-session');

// Must import functions, and necessary features from miniServer3.js
const api = require('./miniServer3');
const APIrequest = require('request');
const http = require('http');

const APIkey = "AIzaSyCSv_GLy2wLNLtQywe-aVYp_sPxd6kexfs";
// const APIkey = "AIzaSyBhtPM5vNlbgCTdW8vtuswPJPFsE2nUaEU";
const url = "https://translation.googleapis.com/language/translate/v2?key="+APIkey

// const port = 59265;
const port = 52520;
const GoogleStrategy = require('passport-google-oauth20');

const sqlite3 = require("sqlite3").verbose();
const fs = require("fs"); // file system

const dbFileName = "Flashcards.db";
const db = new sqlite3.Database(dbFileName);

// Google login credentials, used when the user contacts
// Google, to tell them where he is trying to login to, and show
// that this domain is registered for this service.
// Google will respond with a key we can use to retrieve profile
// information, packed into a redirect response that redirects to
// server162.site:[port]/auth/redirect
const googleLoginData = {
    clientID: '417836023693-affb7o9mpc4usu27eqt5nr3djdssbia8.apps.googleusercontent.com',
    clientSecret: 'XckiOSmEMObQJO_KIGTiziHl',
    callbackURL: '/auth/redirect'

    // clientID: '694960105206-tj52n2ec2qd7iq1hll08fvk9roj9l643.apps.googleusercontent.com',
    // clientSecret: 'JyzYn331tC2K339iOJA7MvEy',
    // callbackURL: '/auth/redirect'
};

const maxSession = 21600000;

// Strategy configuration.
// Tell passport we will be using login with Google, and
// give it our data for registering us with Google.
// The gotProfile callback is for the server's HTTPS request
// to Google for the user's profile information.
// It will get used much later in the pipeline.
passport.use( new GoogleStrategy(googleLoginData, gotProfile) );


// Let's build a server pipeline!

// app is the object that implements the express server
const app = express();

// pipeline stage that just echos url, for debugging
app.use('/', printURL);

// Check validity of cookies at the beginning of pipeline
// Will get cookies out of request, decrypt and check if
// session is still going on.
app.use(cookieSession({
    maxAge: 6 * 60 * 60 * 1000, // Six hours in milliseconds
    // meaningless random string used by encryption
    keys: ['hanger waldo mercy dance']
}));

// Initializes request object for further handling by passport
app.use(passport.initialize());

// If there is a valid cookie, will call deserializeUser()
app.use(passport.session());

// Public static files
app.get('/*',express.static('public'));

// next, handler for url that starts login with Google.
// The app (in public/login.html) redirects to here (not an AJAX request!)
// Kicks off login process by telling Browser to redirect to
// Google. The object { scope: ['profile'] } says to ask Google
// for their user profile information.
app.get('/auth/google',
	passport.authenticate('google',{ scope: ['profile'] }) );
// passport.authenticate sends off the 302 response
// with fancy redirect URL containing request for profile, and
// client ID string to identify this app.

// Google redirects here after user successfully logs in
// This route has three handler functions, one run after the other.
app.get('/auth/redirect',
	// for educational purposes
	function (req, res, next) {
	    console.log("at auth/redirect");
	    next();
	},
	// This will issue Server's own HTTPS request to Google
	// to access the user's profile information with the
	// temporary key we got in the request.
	passport.authenticate('google'),
	// then it will run the "gotProfile" callback function,
	// set up the cookie, call serialize, whose "done"
	// will come back here to send back the response
	// ...with a cookie in it for the Browser!
	function (req, res) {
	    console.log('Logged in and using cookies!')
	    res.redirect('/user/lango.html');
	});

// static files in /user are only available after login
app.get('/user/*',
	isAuthenticated, // only pass on to following function if
	// user is logged in
	// serving files that start with /user from here gets them from ./
	express.static('.')
       );

// next, all queries (like translate or store or get...
app.get('/user/query', api.queryHandler );
app.get('/user/translate', api.translateHandler );
app.get('/user/store', api.storeHandler );
app.get('/user/comparsion', api.comparsionHandler );
app.get('/user/card', api.cardHandler );
// finally, not found...applies to everything
app.use( fileNotFound );

// Pipeline is ready. Start listening!
app.listen(port, function (){console.log('Listening...');} );


// middleware functions

// print the url of incoming HTTP request
function printURL (req, res, next) {
    console.log(req.url);
    next();
}

// function to check whether user is logged when trying to access
// personal data
function isAuthenticated(req, res, next) {
    console.log("isAuthenticated.");
    if (req.user) {

        // if (req.user.timesLoggedIn < 2) 
        if (req.user.timesLoggedIn < 2) {
          req.user.state = { view: "create" };
          // redirect to create
        } else {
          req.user.state = { view: "review" };
          // redirect to review
        }

        // user got reassigned a new cookie
	console.log("Req.session:",req.session);
	console.log("Req.user:",req.user);
	next();
    } else {
	res.redirect('/login.html');  // send response telling
	// Browser to go to login page
    }
}


// function for end of server pipeline
function fileNotFound(req, res) {
    let url = req.url;
    res.type('text/plain');
    res.status(404);
    res.send('Cannot find '+url);
    }

// Some functions Passport calls, that we can use to specialize.
// This is where we get to write our own code, not just boilerplate.
// The callback "done" at the end of each one resumes Passport's
// internal process.

// function called during login, the second time passport.authenticate
// is called (in /auth/redirect/),
// once we actually have the profile data from Google.
function gotProfile(accessToken, refreshToken, profile, done) {
    console.log("gotProfile");
    console.log("Google profile",profile);
    // here is a good place to check if user is in DB,
    // and to store him in DB if not already there.
    // Second arg to "done" will be passed into serializeUser,
    // should be key to get user out of database.

    let first = profile.name.givenName;
    let last = profile.name.familyName;
    // unique user ID will be there google ID
    let id = profile.id;
    let currentTime = new Date();
    // key for db Row for this user in DB table.
    // Note: cannot be zero, has to be something that evaluates to
    // True.

    checkExistingUser(first, last, id, currentTime);
}

// checks if user has already used the site in the past
function checkExistingUser(first, last, id, currentTime) {
    console.log("existingUser");
/*    let insert = 'INSERT INTO User (first, last, id) ';
    let userInformation = 'SELECT \'' + first + '\', \'' + last + '\', ' + id + ' ';
    let ifNotExistingUser = 'WHERE NOT EXISTS (SELECT 1 FROM User WHERE id = ' + id + ')';
    let cmdStr = insert + userInformation + ifNotExistingUser; */
    
    // get data object with user
    let cmdStr = 'SELECT * FROM User WHERE id = ' + id;
    console.log(cmdStr);
    db.all(cmdStr, existingUserCallback);

    function existingUserCallback(err, data) {
        if (err) { 
          console.log("Detected error after sending SQL query"); 
          done(null, id);
        }
        if (data.length === 0) { /* case 1: user has never logged in before */

          let newSession = currentTime;

          // add new user to database and give them a brand new session
          // done() will be called inside insertUser()
          insertUser(first, last, id, newSession);

        } else { /* case 2: user has logged in before */

            // this is how long the user has been logged in
            // I should've named the cookie column, session, instead... but this will do for now
            let userSessionAge = currentTime - data[0].cookie;
          
            // if user hasn't been logged in for more than 6 hours
            if (userSessionAge < maxSession) {

              // increment the number of times user visited site
              let timesLoggedIn = data[0].timesLoggedIn + 1;
              let cmdStr = "UPDATE User SET timesLoggedIn = " + timesLoggedIn + " WHERE id = " + id;
              db.run(cmdStr);
              done(null, id);
            } else { /* user has an expired user sessopm */
              let timesLoggedIn = data[0].timesLoggedIn + 1;
              let newSession = currentTime;

              cmdStr = "UPDATE User SET timesLoggedIn = " + timesLoggedIn + " WHERE id = " + id;
              db.run(cmdStr);
              let cmdStr = "UPDATE User SET cookie = " + newSession + " WHERE id = " + id;
              db.run(cmdStr);
              done(null, id);
          }

        }
    }
}

// insert new user into User table
function insertUser(first, last, id, session) {
    console.log("insertUser.");
    let cmdStr = 'INSERT INTO User (first, last, id, cookie, timesLoggedIn) VALUES (@0, @1, @2, @3, 1)';
    db.run(cmdStr, first, last, id, userInsertionCallback);

    function userInsertionCallback(err) {
        if (err) {
            console.log("User insertion error",err);
            done(null, id);
        } else {
            console.log("Inserted 1 user into User table");
            done(null, id);
        }
    }
}

// Part of Server's sesssion set-up.
// The second operand of "done" becomes the input to deserializeUser
// on every subsequent HTTP request with this session's cookie.
passport.serializeUser((dbRowID, done) => {
    console.log("SerializeUser. Input is",dbRowID);
    done(null, dbRowID);
});

// Called by passport.session pipeline stage on every HTTP request with
// a current session cookie.
// Where we should lookup user database info.
// Whatever we pass in the "done" callback becomes req.user
// and can be used by subsequent middleware.
passport.deserializeUser((dbRowID, done) => {
    console.log("deserializeUser. Input is:", dbRowID);
    // here is a good place to look up user data in database using
    // dbRowID. Put whatever you want into an object. It ends up
    // as the property "user" of the "req" object.
// as the property "user" of the "req" object.

    db.all ( 'SELECT * FROM User WHERE id = ' + dbRowID, sendUsername );

    function sendUsername( err, data ) {

      // done(null, false);  // invalidates the existing login session.
      console.log('sendUsername: modify req');
      // save userData into the req object, right here

      // insert session info here
      let un = data[0].first;
      let tli = data[0].timesLoggedIn;
      let userData = {id: dbRowID, username: un, timesLoggedIn: tli};

      done(null, userData);
    }
});
