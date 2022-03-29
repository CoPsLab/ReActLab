const LocalStrategy = require('passport-local').Strategy;
const passport = require('passport');
const uuid = require('uuid').v4
const bodyParser = require('body-parser')
const session = require('express-session')
const FileStore = require('session-file-store')(session);

const users = [
    { id: '2f24vvg', username: 'test@test.com', password: 'password' }
]

module.exports = {
    init: function (app, baseURL) {
        // order of settings is important here, so don't change it
        // configure passport.js to use the local strategy
        passport.use(new LocalStrategy(
            (username, password, done) => {
                // here is where you make a call to the database
                // to find the user based on their username or email address
                // for now, we'll just pretend we found that it was users[0]
                const user = users[0]
                if (username === user.username && password === user.password) {
                    return done(null, user)
                } else {
                    return done("something went wrong", null);
                }
            }
        ));

        // tell passport how to serialize the user
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser((id, done) => {
            const user = users[0].id === id ? users[0] : false;
            done(null, user);
        });

        app.use(bodyParser.urlencoded({ extended: false }))
        app.use(bodyParser.json())
        app.use(session({
            genid: (req) => { return uuid() },
            store: new FileStore({ logFn: function () { } }),
            secret: 'keyboard cat and dog',
            resave: true,
            saveUninitialized: false,
            cookie: {
                maxAge: 60 * 60 * 1000,
                sameSite: 'strict',
                path: baseURL,
            }
        }))

        app.use(passport.initialize());
        app.use(passport.session());

        ////////////
        /// routes
        ////////////

        // create the login get and post routes
        app.route('/login')
            .get((req, res) => {
                res.render('login', { from: app.path(), baseURL: baseURL, loginURL: app.path() });
            })
            .post((req, res, next) => {
                passport.authenticate('local', (err, user, info) => {
                    req.login(user, async (err) => {
                        if (req.user) {
                            res.redirect(req.body.forward);
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            return res.render('login', { from: req.body.forward, baseURL: baseURL, loginURL: app.path(), failed: true });
                        }
                    })
                })(req, res, next);
            });

        // create the logout route
        app.get('/logout', (req, res) => {
            req.logout();
            req.session.destroy(() => {
                res.redirect(baseURL + '/abort');
            });
        });
    }
}