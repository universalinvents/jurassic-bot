/*
* Copyright 2016-present, Facebook, Inc.
* All rights reserved.
*
* This source code is licensed under the license found in the
* LICENSE file in the root directory of this source tree.
*
*/

/* jshint node: true, devel: true */
'use strict';

const
    bodyParser = require('body-parser'),
    config = require('config'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request'),
    geolib = require('geolib');

const QUICK_REPLIES = [
    {
        "content_type":"text",
        "title":"News",
        "payload":"news",
        "image_url": "https://cdn3.iconfinder.com/data/icons/linecons-free-vector-icons-pack/32/news-512.png"
    },
    {
        "content_type":"text",
        "title":"Trailers",
        "payload":"trailers",
        "image_url": "https://d30y9cdsu7xlg0.cloudfront.net/png/17793-200.png"
    },
    {
        "content_type":"text",
        "title":"Games",
        "payload":"games",
        "image_url": "https://i.pinimg.com/originals/97/3e/e2/973ee216a3181a881bca360d7b0fee6a.png"
    }
];

var app = express();
app.set('port', process.env.PORT || 6000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
* Be sure to setup your config values before running this code. You can
* set them using environment variables or modifying the config file in /config.
*
*/

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ?
process.env.MESSENGER_APP_SECRET :
config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
(process.env.MESSENGER_VALIDATION_TOKEN) :
config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
(process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and
// assets located at this address.
const SERVER_URL = (process.env.SERVER_URL) ?
(process.env.SERVER_URL) :
config.get('serverURL');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
    console.error("Missing config values");
    process.exit(1);
}

/*
* Use your own validation token. Check that the token used in the Webhook
* setup is the same token used here.
*
*/
app.get('/webhook', function(req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});


/*
* All callbacks for Messenger are POST-ed. They will be sent to the same
* webhook. Be sure to subscribe your app to your page to receive callbacks
* for your page.
* https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
*
*/
app.post('/webhook', function (req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else if (messagingEvent.referral) {
                    receiveReferral(messagingEvent);
                } else if (messagingEvent.payment) {
                    receivedPayment(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

/*
* This path is used for account linking. The account linking call-to-action
* (sendAccountLinking) is pointed to this URL.
*
*/
app.get('/authorize', function(req, res) {
    var accountLinkingToken = req.query.account_linking_token;
    var redirectURI = req.query.redirect_uri;

    // Authorization Code should be generated per user by the developer. This will
    // be passed to the Account Linking callback.
    var authCode = "1234567890";

    // Redirect users to this URI on successful login
    var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        redirectURISuccess: redirectURISuccess
    });
});

/*
* Verify that the callback came from Facebook. Using the App Secret from
* the App Dashboard, we can verify the signature that is sent with each
* callback in the x-hub-signature field, located in the header.
*
* https://developers.facebook.com/docs/graph-api/webhooks#setup
*
*/
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', APP_SECRET)
        .update(buf)
        .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

/*
* Authorization Event
*
* The value for 'optin.ref' is defined in the entry point. For the "Send to
* Messenger" plugin, it is the 'data-ref' field. Read more at
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
*
*/
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam,
    timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
* Message Event
*
* This event is called when a message is sent to your page. The 'message'
* object format can vary depending on the kind of message that was received.
* Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
*
* For this example, we're going to echo any text that we get. If we get some
* special keywords ('button', 'generic', 'receipt'), then we'll send back
* examples of those bubbles to illustrate the special message bubbles we've
* created. If we receive a message with an attachment (image, video, audio),
* then we'll simply confirm that we've received the attachment.
*
*/
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;
    var isLocation = message.mid && message.attachments
    && message.attachments.length > 0 && message.attachments[0].payload.coordinates;

    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s",
        messageId, appId, metadata);
        return;
    } else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        console.log("Quick reply for message %s with payload %s",
        messageId, quickReplyPayload);

        switch(quickReplyPayload) {
            case 'trailers':
            sendTrailerList(senderID);
            break;
            case 'news':
            sendNewsMessage(senderID);
            break;
            case 'games':
            sendGamesMessage(senderID);
            break;
        }
        return;
    }
    else if (isLocation) {
        var location = message.attachments[0].payload.coordinates;
        var stores = config.get('locations');
        stores.forEach(function(store) {
            var locationSplit = store.location.split(",");
            var otherLoc = { latitude: locationSplit[0], longitude: locationSplit[1] };
            var distance = geolib.getDistance(
                { longitude: location.long, latitude: location.lat },
                otherLoc
            );
            store.distance = distance;
        });
        stores.sort(function(a,b) {
            if (a.distance < b.distance) { return -1; }
            else if (a.distance > b.distance) { return 1; }
            else if (a.distance == b.distance) { return 0; }
        });

        console.log(stores.slice(0,3))

        sendStoresLocationMessage(senderID, stores.slice(0,3), location.lat+","+location.long);
    }

    if (messageText) {

        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.
        console.log(messageText)

        var parsedMsg = messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase();
        console.log(parsedMsg);
        if (parsedMsg.startsWith('zip ')) {
            var zip = parsedMsg.split('zip ')[1];
            sendZipMessage(senderID, zip);
            return;
        }

        switch (parsedMsg) {

            case 'get started':
            sendWelcomeMessage(senderID);
            break;

            case 'help':
            case 'help me':
            sendGetStarted(senderID);
            break;

            case 'ar':
            sendAR1Message(senderID);
            break;

            case 'where to buy':
            case 'where to buy?':
            case 'location':
            case 'locations':
            sendLocationMessage(senderID);
            break;

            case 't1':
            sendT1Message();
            break;

            case 't2':
            sendT2Message();
            break;

            case 't3':
            sendT3Message();
            break;

            case 'ma':
            sendMoviesAnywhereMessage(senderID);
            break;

            case 'buy':
            sendPaymentMessage(senderID);
            break;

            case "whats new":
            sendNewsMessage(senderID);
            break;

            case 'game':
            case 'games':
            sendGamesMessage(senderID);
            break;

            case 'where to buy?':
            console.log('where to buy? sent');
            break;

            case 'hello':
            case 'hi':
            sendHiMessage(senderID);
            break;

            case 'image':
            requiresServerURL(sendImageMessage, [senderID]);
            break;

            case 'gif':
            requiresServerURL(sendGifMessage, [senderID]);
            break;

            case 'audio':
            requiresServerURL(sendAudioMessage, [senderID]);
            break;

            case 'video':
            requiresServerURL(sendVideoMessage, [senderID]);
            break;

            case 'file':
            requiresServerURL(sendFileMessage, [senderID]);
            break;

            case 'button':
            sendButtonMessage(senderID);
            break;

            case 'generic':
            requiresServerURL(sendGenericMessage, [senderID]);
            break;

            case 'receipt':
            requiresServerURL(sendReceiptMessage, [senderID]);
            break;

            case 'quick reply':
            sendQuickReply(senderID);
            break;

            case 'read receipt':
            sendReadReceipt(senderID);
            break;

            case 'typing on':
            sendTypingOn(senderID);
            break;

            case 'typing off':
            sendTypingOff(senderID);
            break;

            case 'account linking':
            requiresServerURL(sendAccountLinking, [senderID]);
            break;

            default:
            sendTextMessage(senderID, messageText);
        }
    } else if (messageAttachments) {
        // sendTextMessage(senderID, "Message with attachment received");
    }
}


/*
* Delivery Confirmation Event
*
* This event is sent to confirm the delivery of a message. Read more about
* these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
*
*/
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function(messageID) {
            console.log("Received delivery confirmation for message ID: %s",
            messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}


/*
* Postback Event
*
* This event is called when a postback is tapped on a Structured Message.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
*
*/
function receivedPostback(event) {
    console.log(event);
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);
    console.log(payload);
    switch(payload) {
        case 'get_started':
        if (event.postback.referral && event.postback.referral.ref == 'ar-1') {
            sendWelcomeMessage(senderID, true);
        }
        else {
            sendWelcomeMessage(senderID);
        }
        break;
        case 'set_notifications_on':
        console.log('Setting subscription notifications on');
        sendGetStarted(senderID);
        break;
        case 'store_locations':
        sendLocationMessage(senderID);
        break;
        case 'buy':
        sendPaymentMessage(senderID);
        break;
        case 'watch_trailer_1':
        sendTrailerMessage(
            senderID,
            'https://www.facebook.com/JurassicWorld/videos/1831201053591436/'
        );
        break;
        case 'watch_trailer_2':
        sendTrailerMessage(
            senderID,
            'https://www.facebook.com/JurassicWorld/videos/1741273549250854/UzpfSTQ1NzY3MzcxNDI3MDg0NToxNjYyOTI2NzgwNDEyMTkz/'
        );
        break;
        case 'watch_trailer_3':
        sendTrailerMessage(
            senderID,
            'https://www.facebook.com/JurassicWorld/videos/1870976169613924/'
        );
        break;
        default:
        // When a postback is called, we'll send a message back to the sender to
        // let them know it was successful
        sendTextMessage(senderID, "Postback called");

    }
}

/*
* Referral Event
*
* This event is called when a parametric code was scanned
*/
function receiveReferral(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    var payload = event.referral;

    console.log("Received referral for user %d and page %d with payload '%s' ",
    senderID, recipientID, payload);

    // Parametric code scanned
    if (payload.source == 'MESSENGER_CODE') {
        switch(payload.ref) {
            case 'ar-1':
            sendAR1Message(senderID);
            break;
            case 'contest-loser':
            sendContestMessage(
                senderID,
                "Sorry, you didn't win this week. "+
                "Don't lose hope though. Try again next week!"
            );
            break;
            case 'contest-winner':
            sendContestMessage(
                senderID,
                "Congratulations! You are this week's winner!!"
            );
            break;
            default:
            console.log('pie');
        }
    }
}

/*
* Payment Event
*
* This event is called when a payment was received
*/
function receivedPayment(event) {
    console.log(event);
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.payment;

    console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

    sendMoviesAnywhereMessage(senderID);
}

/*
* Message Read Event
*
* This event is called when a previously-sent message has been read.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
*
*/
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}

/*
* Account Link Event
*
* This event is called when the Link Account or UnLink Account action has been
* tapped.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
*
*/
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
* If users came here through testdrive, they need to configure the server URL
* in default.json before they can access local resources likes images/videos.
*/
function requiresServerURL(next, [recipientId, ...args]) {
    if (SERVER_URL === "to_be_set_manually") {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: `
                We have static resources like images and videos available to test, but you need to update the code you downloaded earlier to tell us your current server url.
                1. Stop your node server by typing ctrl-c
                2. Paste the result you got from running "lt —port 5000" into your config/default.json file as the "serverURL".
                3. Re-run "node app.js"
                Once you've finished these steps, try typing “video” or “image”.
                `
            }
        }

        callSendAPI(messageData);
    } else {
        next.apply(this, [recipientId, ...args]);
    }
}

function sendHiMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: `
            Congrats on setting up your Messenger Bot!

            Right now, your bot can only respond to a few words. Try out "quick reply", "typing on", "button", or "image" to see how they work. You'll find a complete list of these commands in the "app.js" file. Anything else you type will just be mirrored until you create additional commands.

            For more details on how to create commands, go to https://developers.facebook.com/docs/messenger-platform/reference/send-api.
            `
        }
    }

    callSendAPI(messageData);
}

/*
* Send an image using the Send API.
*
*/
function sendImageMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/rift.png"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a Gif using the Send API.
*
*/
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send audio using the Send API.
*
*/
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a video using the Send API.
*
*/
function sendVideoMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: SERVER_URL + "/assets/allofus480.mov"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a file using the Send API.
*
*/
function sendFileMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: SERVER_URL + "/assets/test.txt"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a text message using the Send API.
*
*/
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData);
}

/*
* Send a button message using the Send API.
*
*/
function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons:[{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPER_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a Structured Message (Generic Message type) using the Send API.
*
*/
function sendGenericMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "rift",
                        subtitle: "Next-generation virtual reality",
                        item_url: "https://www.oculus.com/en-us/rift/",
                        image_url: SERVER_URL + "/assets/rift.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/rift/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for first bubble",
                        }],
                    }, {
                        title: "touch",
                        subtitle: "Your Hands, Now in VR",
                        item_url: "https://www.oculus.com/en-us/touch/",
                        image_url: SERVER_URL + "/assets/touch.png",
                        buttons: [{
                            type: "web_url",
                            url: "https://www.oculus.com/en-us/touch/",
                            title: "Open Web URL"
                        }, {
                            type: "postback",
                            title: "Call Postback",
                            payload: "Payload for second bubble",
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a receipt message using the Send API.
*
*/
function sendReceiptMessage(recipientId) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random()*1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message:{
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: "Peter Chang",
                    order_number: receiptId,
                    currency: "USD",
                    payment_method: "Visa 1234",
                    timestamp: "1428444852",
                    elements: [{
                        title: "Oculus Rift",
                        subtitle: "Includes: headset, sensor, remote",
                        quantity: 1,
                        price: 599.00,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/riftsq.png"
                    }, {
                        title: "Samsung Gear VR",
                        subtitle: "Frost White",
                        quantity: 1,
                        price: 99.99,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/gearvrsq.png"
                    }],
                    address: {
                        street_1: "1 Hacker Way",
                        street_2: "",
                        city: "Menlo Park",
                        postal_code: "94025",
                        state: "CA",
                        country: "US"
                    },
                    summary: {
                        subtotal: 698.99,
                        shipping_cost: 20.00,
                        total_tax: 57.67,
                        total_cost: 626.66
                    },
                    adjustments: [{
                        name: "New Customer Discount",
                        amount: -50
                    }, {
                        name: "$100 Off Coupon",
                        amount: -100
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a message with Quick Reply buttons.
*
* NOTE: Opening camera effect doesn't work...
*/
function sendQuickReply(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons:[{
                        "type":"branded_camera",
                        "title":"<CTA_TITLE>",
                        "camera_metadata": {
                            "content_id":"199604150680617"
                        }
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a read receipt to indicate the message has been read
*
*/
function sendReadReceipt(recipientId) {
    console.log("Sending a read receipt to mark message as seen");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
* Turn typing indicator on
*
*/
function sendTypingOn(recipientId) {
    console.log("Turning typing indicator on");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
* Turn typing indicator off
*
*/
function sendTypingOff(recipientId) {
    console.log("Turning typing indicator off");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
* Send a message with the account linking call-to-action
*
*/
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons:[{
                        type: "account_link",
                        url: SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send the default set of quick actions: News, Trailers, Games
*
*/
function sendQuickActions(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What do you need",
            quick_replies: [
                {
                    "content_type":"text",
                    "title":"News",
                    "payload":"news",
                    "image_url": "https://cdn3.iconfinder.com/data/icons/linecons-free-vector-icons-pack/32/news-512.png"
                },
                {
                    "content_type":"text",
                    "title":"Trailers",
                    "payload":"trailers",
                    "image_url": "https://d30y9cdsu7xlg0.cloudfront.net/png/17793-200.png"
                },
                {
                    "content_type":"text",
                    "title":"Games",
                    "payload":"games",
                    "image_url": "https://i.pinimg.com/originals/97/3e/e2/973ee216a3181a881bca360d7b0fee6a.png"
                }
            ]
        }
    };

    callSendAPI(messageData);
}

/*
* Default welcome message
*
*/
function sendGetStarted(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What are you looking for?",
            quick_replies: [
                {
                    "content_type":"text",
                    "title":"News",
                    "payload":"news",
                    "image_url": "https://cdn3.iconfinder.com/data/icons/linecons-free-vector-icons-pack/32/news-512.png"
                },
                {
                    "content_type":"text",
                    "title":"Trailers",
                    "payload":"trailers",
                    "image_url": "https://d30y9cdsu7xlg0.cloudfront.net/png/17793-200.png"
                },
                {
                    "content_type":"text",
                    "title":"Games",
                    "payload":"games",
                    "image_url": "https://i.pinimg.com/originals/97/3e/e2/973ee216a3181a881bca360d7b0fee6a.png"
                }
            ]
        }
    };

    callSendAPI(messageData);
}

/*
* Request to send notifications
*
*/
function sendNotificationMessage(recipientId, showAR) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "There's a secret event happening at a location near you. "
                        + "Would you like to stay up to date?",
                        subtitle: "Join the list and keep up-to-date.",
                        image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/Screen+Shot+2018-05-30+at+3.33.24+PM.png",
                        buttons: [{
                            type: "postback",
                            title: "Yes I'm In!",
                            payload: "set_notifications_on"
                        }],
                    }]
                }
            }
        }
    };

    if (showAR) {
        callSendAPI(messageData, function() {
            sendAR1Message(recipientId);
        });
    }
    else {
        callSendAPI(messageData);
    }
}

/*
* Send game link
*
*/
function sendGamesMessage(recipientId) {
    var link = encodeURIComponent("https://itunes.apple.com/ca/app/jurassic-world-alive/id1231085864");
    var messageData = {
        recipient: {
            id: recipientId
        },
        messaging_type: 'response',
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "Jurassic World Alive AR Game",
                        subtitle: "Game on iOS and Android\nMobile",
                        image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/Jurassic-World-Alive.jpg",
                        buttons: [{
                            title: "Play",
                            type: "web_url",
                            url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/games-ui/index.html?u="+link,
                            messenger_extensions: true,
                            webview_height_ratio: 'compact'
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a list of trailers
*
*/
function sendTrailerList(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [
                        {
                            title: "Jurassic World Fallen Kingdom",
                            subtitle: "Trailer 1\n2m 30s",
                            image_url:  "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/Jurassic-World-Global-trailer-03-1280x640.jpg",
                            buttons: [{
                                type: "postback",
                                title: "Watch",
                                payload: "watch_trailer_1"
                            }]
                        },
                        {
                            title: "Jurassic World Fallen Kingdom",
                            subtitle: "Trailer 2\n0m 16s",
                            image_url:  "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/Jurassic-World-Fallen-Kingdom-Teaser-Trailer-T-Rex.jpg",
                            buttons: [{
                                type: "postback",
                                title: "Watch",
                                payload: "watch_trailer_2"
                            }]
                        },
                        {
                            title: "Jurassic World Fallen Kingdom",
                            subtitle: "Trailer 3\n0m 10s",
                            image_url:  "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/jurassic-world-fallen-kingdom-logo-feature.jpg",
                            buttons: [{
                                type: "postback",
                                title: "Watch",
                                payload: "watch_trailer_3"
                            }]
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send an individual trailer
*
*/
function sendTrailerMessage(recipientId, url) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: 'media',
                    elements: [
                        {
                            media_type: 'video',
                            url: url
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a list of locations
*
*/
function sendStoresLocationMessage(recipientId, locations, center) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "Here are your closest locations. Looking for a specific location? "
            + 'Type "zip" followed by your code.',
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData, function() {
        var buildStaticMapUrl = function(otherLoc) {
            var baseUrl = 'https://maps.googleapis.com/maps/api/staticmap?&size=600x300&maptype=roadmap';
            return baseUrl
            + '&center=' + center
            + '&markers=color:red|label:B|' + otherLoc
            + '&markers=color:blue|label:A|' + center
            + '&key=' + config.get('googleMapKey');
        };

        var buildDirectionsUrl = function(otherLoc) {
            // var directionsUrl = 'https://www.google.com/maps/dir/'
            //     + center + '/'
            //     + otherLoc;

            var directionsUrl = 'https://maps.google.com/?q='+otherLoc;
            var link = encodeURIComponent(directionsUrl);
            // return directionsUrl;
            return "https://s3.us-east-2.amazonaws.com/jurassic-bot/games-ui/index.html?u="+link;
        };

        var elements = locations.map(function(l) {
            console.log(buildStaticMapUrl(l.location));
            return {
                title: l.name + " ("+Math.round(l.distance*0.00621371)/10 + " mi)",
                subtitle: "Tap to view on map",
                image_url: buildStaticMapUrl(l.location),
                default_action: {
                    type: "web_url",
                    url: buildDirectionsUrl(l.location),
                    messenger_extensions: true,
                    webview_height_ratio: 'compact'
                }
            };
        });

        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                quick_replies: QUICK_REPLIES,
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "generic",
                        elements: elements
                    }
                }
            }
        };

        callSendAPI(messageData);
    });
}

/*
* Send a list of locations closest to a zip code
*
*/
function sendZipMessage(recipientId, zip) {
    request({
        uri: 'http://maps.googleapis.com/maps/api/geocode/json',
        qs: { address: zip },
        method: 'GET'

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            if (body.results && body.results.length > 0 &&
                body.results[0].geometry && body.results[0].geometry.location) {
                var location = body.results[0].geometry.location;
                console.log(location);
                var stores = config.get('locations');
                stores.forEach(function(store) {
                    var locationSplit = store.location.split(",");
                    var otherLoc = { latitude: locationSplit[0], longitude: locationSplit[1] };
                    var distance = geolib.getDistance(
                        { longitude: location.lng, latitude: location.lat },
                        otherLoc
                    );
                    store.distance = distance;
                });
                stores.sort(function(a,b) {
                    if (a.distance < b.distance) { return -1; }
                    else if (a.distance > b.distance) { return 1; }
                    else if (a.distance == b.distance) { return 0; }
                });

                console.log(stores.slice(0,3))

                sendStoresLocationMessage(recipientId, stores.slice(0,3), location.lat+","+location.lng);

            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}

/*
* Request location
*
*/
function sendLocationMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What's your location?",
            quick_replies: [
                {
                    content_type: "location"
                }
            ]
        }
    };

    callSendAPI(messageData);
}

/*
* Send a list of news articles
*
*/
function sendNewsMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [
                        {
                            title: "Fandango Launches Prop Store",
                            subtitle: "Article\nVariety",
                            image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/jurassic-world-indominus-rex-head+(1).jpg",
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": "https://variety.com/2018/film/news/fandango-prop-store-jurassic-world-fallen-kingdom-1202811346/",
                                "messenger_extensions": true,
                                "webview_height_ratio": "tall"
                            }]
                        },
                        {
                            title: "Watch ‘Jurassic World Alive’ Trailer for ‘Pokemon Go’ Take on ‘Jurassic World’ (EXCLUSIVE)",
                            subtitle: "Article\nVariety",
                            image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/jurassic-world-alive-feature.jpg",
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": "https://variety.com/2018/gaming/news/jurassic-world-alive-trailer-1202825047/",
                                "messenger_extensions": true,
                                "webview_height_ratio": "tall"
                            }]
                        },
                        {
                            title: "Jurassic World Evolution: 6 Quick Facts You Should Know",
                            subtitle: "Article\nCultured Vultures",
                            image_url: "https://41zxbw463fq733z1kl101n01-wpengine.netdna-ssl.com/wp-content/uploads/2018/05/Jurassic-World-Evolution-750x430.jpg",
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": "https://culturedvultures.com/jurassic-world-evolution-6-quick-facts-you-should-know/",
                                "messenger_extensions": true,
                                "webview_height_ratio": "tall"
                            }]
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send initial welcome message
*
*/
function sendWelcomeMessage(recipientId, showAR) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "Welcome to the Jurassic World bot experience. "
            + "The best place to find exclusive Jurassic content!",
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData, function() {
        sendNotificationMessage(recipientId, showAR);
    });
}

/*
* Request payment
*
*/
function sendPaymentMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "Jurassic World [HD]",
                        image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/JURASSIC_WORLD.jpg",
                        buttons: [{
                            "type":"payment",
                            "title":"buy",
                            "payload":"purchase",
                            "payment_summary":{
                                "currency":"USD",
                                "payment_type":"FIXED_AMOUNT",
                                "is_test_payment" : true,
                                "merchant_name":"Jurassic World [HD]",
                                "requested_user_info":[
                                    "shipping_address",
                                    "contact_name",
                                    "contact_phone",
                                    "contact_email"
                                ],
                                "price_list":[
                                    {
                                        "label":"Subtotal",
                                        "amount":"9.99"
                                    },
                                    {
                                        "label":"Taxes",
                                        "amount":"0.65"
                                    }
                                ]
                            }
                        }],
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send redemption site message
*
*/
function sendMoviesAnywhereMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "Movies Anywhere",
                        subtitle: "Jurassic World [HD]",
                        image_url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/images/logo.png",
                        buttons: [{
                            title: "Redeem",
                            type: "web_url",
                            //   url: "https://moviesanywhere.com/redeem?code=4YMM9NK9M7EE",
                            url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/games-ui/redeem.html",
                            messenger_extensions: true,
                            webview_height_ratio: 'tall'
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a link to an AR experience
*
*/
function sendAR1Message(recipientId) {
    var link = encodeURIComponent('https://itunes.apple.com/us/app/ar-studio-player/id1231451896?mt=8');
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "media",
                    elements: [{
                        media_type: "image",
                        attachment_id: "247200862498201",
                        buttons: [{
                            title: "Unlock",
                            type: "web_url",
                            url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/games-ui/index.html?u="+link,
                            messenger_extensions: true,
                            webview_height_ratio: 'compact'
                        }]
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a broadcast message
*
*/
function sendT1Message() {
    var messageData = {
        messages: [{
            quick_replies: QUICK_REPLIES,
            text: "The secret event is 1 week away. It won't be long, the Fallen Kingdom will be taking over a location near you!"
        }]
    };

    callBroadcastAPI(messageData);
}

/*
* Send a broadcast message
*
*/
function sendT2Message() {
    var messageData = {
        messages: [
            {
                text: "The Fallen Kingdom is here! There are life size Jurassic World Dinosaurs at selected retail locations near you. You'll even get to take one home with you. Search for the closest location by clicking below.",
                quick_replies:[
                    { "content_type":"location" }
                ]
            }
        ]
    };

    callBroadcastAPI(messageData);
}

/*
* Send a broadcast message
*
*/
function sendT3Message() {
    var messageData = {
        messages: [
            {
                text: "There's one week left! Have you seen the Jurassic Dinosaurs yet? Search for them here.",
                quick_replies:[
                    { "content_type":"location" }
                ]
            }
        ]
    };

    callBroadcastAPI(messageData);
}

/*
* Contest messages
*
*/
function sendContestMessage(recipientId, message) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: message,
            quick_replies: QUICK_REPLIES
        }
    };

    callSendAPI(messageData);
}

/*
* Call the Send API. The message data goes in the body. If successful, we'll
* get the message id in a response
*
*/
function callSendAPI(messageData, callback) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                recipientId);
            }

            if (callback) {
                callback(recipientId);
            }

        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}

/*
* Call the Broadcast API
*
*/
function callBroadcastAPI(messageData, callback) {
    request({
        uri: 'https://graph.facebook.com/v2.11/me/message_creatives',
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var messageId = body.message_creative_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                messageId);

                request({
                    uri: 'https://graph.facebook.com/v2.11/me/broadcast_messages',
                    qs: { access_token: PAGE_ACCESS_TOKEN },
                    method: 'POST',
                    json: {
                        message_creative_id: messageId,
                        notification_type: "REGULAR",
                        messaging_type: "MESSAGE_TAG"
                    }
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var messageId = body.broadcast_id;

                        if (messageId) {
                            console.log("Successfully sent message with id %s to recipient %s",
                            messageId);
                        }

                        if (callback) {
                            callback(recipientId);
                        }
                    } else {
                        console.error("Failed calling Broadcast API", response.statusCode, response.statusMessage, body.error);
                    }
                });
            }
        } else {
            console.error("Failed calling Broadcast API", response.statusCode, response.statusMessage, body.error);
        }
    });
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
