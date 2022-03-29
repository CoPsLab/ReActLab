const mailOptions = {
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false, // upgrade later with STARTTLS
    requireTLS: true, // set to true to make sure we only use TLS encrypted connections
    logger: false,
    debug: false,
}

if (process.env.MAIL_USER) {
    mailOptions.auth = {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    }
}

const sendmail = require('nodemailer').createTransport(mailOptions);
const pug = require('pug');

module.exports = {
    // simply sends an email
    mailTo: function (sender, receiver, subject, htmlText) {
        if (!module.exports.displayMailDisabled()) {
            sendmail.sendMail({
                from: sender,
                to: receiver,
                subject: subject,
                html: htmlText,
            }, function (err, info) {
                if (err)
                    console.error(err);
                // console.log(info);
            })
        }
    },

    // helper to check if the mail functions are disabled (in that case returns true)
    // also outputs a warning on the console if this is the case
    displayMailDisabled: function () {
        if (process.env.MAIL_ENABLED && process.env.MAIL_ENABLED.trim() != 'true') {
            console.warn('trying to send mail while this option is disabled. ' +
                'Set MAIL_ENABLED=true in the .env file if you want to use this feature.');
            return true;
        }
        return false;
    },

    // sends an infitation mail with the given parameters
    // TODO: make this more flexible for different form files etc. 
    sendInvite(mailTemplate, receiver, experimentName, experimentURL, qrCodeLink, qrImgWidth = 300) {
        const html = pug.renderFile(mailTemplate, {
            expName: experimentName,
            expLink: experimentURL,
            imgWidth: qrImgWidth,
            imgSrc: qrCodeLink,
        });
        module.exports.mailTo(process.env.MAIL_SENDER || "no-reply@cops.ifp.uni-ulm.de",
            receiver,
            "Invitation to experiment " + experimentName,
            html
        );
    }

}