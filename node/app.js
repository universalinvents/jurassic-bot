'use strict';

const
    bodyParser = require('body-parser'),
    config = require('config'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request'),
    geolib = require('geolib');

// Setup the Server
var app = express();
app.set('port', process.env.PORT || 6000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
* Be sure to setup your config values (config/default.json)before running this code.
*
*/

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKENS = config.get('pageAccessTokens');

const GOOGLE_MAP_KEY = config.get('googleMapKey');
const LOCATIONS = config.get('locations');
const AR_CODES = config.get('arCodes');
const GALLERY = config.get('imgGallery');
const TRAILERS = config.get('trailers');
const PROMO = config.get('promo');
const GAME_ASSETS = config.get('gameAssets');
const REDIRECT_URL = config.get('redirectUrl');
const NEWS_ARTICLES = config.get('newsArticles');
const SHOWTIMES_URL = config.get('showTimesUrl');
const POSTER_URL = config.get('posterUrl');
const MOVIES_ANYWHERE_URL = config.get('moviesAnywhereUrl');
const REDEEM_URL = config.get('redeemUrl');
const ENTER_CONTEST_IMAGE_ID = config.get('enterContestImageId');
const AR_STUDIO_PLAYER_URL = config.get('arStudioPlayerUrl');
const QUICK_REPLY_IMAGE_URLS = config.get('quickReplyImageUrls');
const AR_IMAGE_ID = config.get('arImageId');

// These should return after every message
const QUICK_REPLIES = [
    {
        "content_type":"text",
        "title":"Tickets",
        "payload":"tickets",
        "image_url": QUICK_REPLY_IMAGE_URLS.tickets
    },
    {
        "content_type":"text",
        "title":"News",
        "payload":"news",
        "image_url": QUICK_REPLY_IMAGE_URLS.news
    },
    {
        "content_type":"text",
        "title":"Trailers",
        "payload":"trailers",
        "image_url": QUICK_REPLY_IMAGE_URLS.trailers
    },
    {
        "content_type":"text",
        "title":"Photo Gallery",
        "payload":"gallery",
        "image_url": QUICK_REPLY_IMAGE_URLS.gallery
    },
    {
        "content_type":"text",
        "title":"Games",
        "payload":"games",
        "image_url": QUICK_REPLY_IMAGE_URLS.games
    }
];

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKENS
    && GOOGLE_MAP_KEY && LOCATIONS && AR_CODES && GALLERY && TRAILERS && PROMO
    && GAME_ASSETS && REDIRECT_URL && NEWS_ARTICLES && SHOWTIMES_URL && POSTER_URL
    && MOVIES_ANYWHERE_URL && REDEEM_URL && ENTER_CONTEST_IMAGE_ID
    && AR_STUDIO_PLAYER_URL && QUICK_REPLY_IMAGE_URLS && AR_IMAGE_ID)) {
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
    }
    else {
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
                }
                else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                }
                else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                }
                else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                }
                else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                }
                else if (messagingEvent.referral) {
                    receiveReferral(messagingEvent);
                }
                else if (messagingEvent.payment) {
                    receivedPayment(messagingEvent);
                }
                else {
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
    }
    else {
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
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;
    var isLocation = message.mid && message.attachments
        && message.attachments.length > 0
        && message.attachments[0].payload
        && message.attachments[0].payload.coordinates;

    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s",
        messageId, appId, metadata);
        return;
    }
    else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        console.log("Quick reply for message %s with payload %s",
        messageId, quickReplyPayload);

        switch(quickReplyPayload) {
            case 'tickets':
                sendTicketMessage(senderID);
                break;
            case 'trailers':
                sendTrailerList(senderID);
                break;
            case 'news':
                sendNewsMessage(senderID);
                break;
            case 'games':
                sendGamesMessage(senderID);
                break;
            case 'gallery':
                sendGalleryMessage(senderID);
                break;
        }
        return;
    }
    else if (isLocation) {
        // If the user sent their location, then send back a list of configured
        // stores sorted by closest distance.
        var location = message.attachments[0].payload.coordinates;
        var stores = LOCATIONS;
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

        sendStoresLocationMessage(
            senderID, stores.slice(0,3), location.lat+","+location.long
        );
    }

    if (messageText) {
        // If we receive a text message, check to see if it matches any special
        // keywords and send back the corresponding example. Otherwise, just echo
        // the text we received.

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
            case 'tickets':
                sendTicketMessage(senderID);
                break;
            case 'trailers':
                sendTrailerList(senderID);
                break;
            case 'news':
                sendNewsMessage(senderID);
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
            default:
                sendTextMessage(senderID, messageText);
        }
    }
}


/*
* Delivery Confirmation Event
*
* This event is sent to confirm the delivery of a message.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
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
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

    switch(payload) {
        case 'get_started':
            if (event.postback.referral &&
                AR_CODES.indexOf(event.postback.referral.ref) > -1) {
                sendWelcomeMessage(senderID, true);
            }
            else if (event.postback.referral && event.postback.referral.ref == 'dna-1') {
                sendTextMessage(
                    senderID,
                    "You've collected 1 part of the DNA."
                );
            }
            else {
                sendWelcomeMessage(senderID);
            }
            break;
        case 'set_notifications_on':
            sendGetStarted(senderID);
            break;
        case 'store_locations':
            sendLocationMessage(senderID);
            break;
        case 'buy':
            sendPaymentMessage(senderID);
            break;
        case 'watch_trailer_0':
            sendTrailerMessage(
                senderID,
                TRAILERS[0].id
            );
            break;
        case 'watch_trailer_1':
            sendTrailerMessage(
                senderID,
                TRAILERS[1].id
            );
            break;
        case 'view_gallery_0':
            sendImageMesage(
                senderID,
                GALLERY[0].id
            );
            break;
        case 'view_gallery_1':
            sendImageMesage(
                senderID,
                GALLERY[1].id
            );
            break;
        case 'view_gallery_2':
            sendImageMesage(
                senderID,
                GALLERY[2].id
            );
            break;
        case 'view_gallery_3':
            sendImageMesage(
                senderID,
                GALLERY[3].id
            );
            break;
        case 'view_gallery_4':
            sendImageMesage(
                senderID,
                GALLERY[4].id
            );
            break;
        case 'view_gallery_5':
            sendImageMesage(
                senderID,
                GALLERY[5].id
            );
            break;
        case 'view_gallery_6':
            sendImageMesage(
                senderID,
                GALLERY[6].id
            );
            break;
        case 'view_gallery_7':
            sendImageMesage(
                senderID,
                GALLERY[7].id
            );
            break;
        case 'view_gallery_8':
            sendImageMesage(
                senderID,
                GALLERY[8].id
            );
            break;
        case 'view_gallery_9':
            sendImageMesage(
                senderID,
                GALLERY[9].id
            );
            break;
        case 'view_gallery_10':
            sendImageMesage(
                senderID,
                GALLERY[10].id
            );
            break;

        case 'enter_contest':
            sendEnterContestMessage(senderID);
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
* See here to generate a parametric code:
* https://developers.facebook.com/docs/messenger-platform/discovery/messenger-codes/
*
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

        if (AR_CODES.indexOf(payload.ref) > -1) {
            sendAR1Message(senderID);
            return;
        }

        switch(payload.ref) {
            case 'dna-1':
                sendTextMessage(
                    senderID,
                    "You've collected 1 part of the DNA."
                );
                break;
            case 'dna-2':
                sendTextMessage(
                    senderID,
                    "You've collected 2 parts of the DNA."
                );
                break;
            case 'dna-3':
                sendContestMessage(
                    senderID,
                    "You've collected the full DNA strand!"
                );
                break;
        }
    }
}

/*
* Payment Event
*
* This event is called when a payment was received
*/
function receivedPayment(event) {
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
* Send the default set of quick actions: News, Trailers, Games
*
*/
function sendQuickActions(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: "What do you need?",
            quick_replies: QUICK_REPLIES
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
            quick_replies: QUICK_REPLIES
        }
    };

    callSendAPI(messageData);
}

/*
* Send the Jurassic trailer
*
*/
function sendGifMessage(recipientId, showAR) {
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
                            media_type: 'image',
                            attachment_id: PROMO.gifId
                        }
                    ]
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

    sendNotificationMessage(recipientId);
}

/*
* Request to send notifications
*
*/
function sendNotificationMessage(recipientId) {
    var messageData = {
        messages: [{
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "There's a secret event happening at a location near you. "
                            + "Stay up to date?",
                       subtitle: "Join the list and keep up-to-date.",
                       image_url: PROMO.imageUrl,
                       buttons: [{
                           type: "postback",
                           title: "Yes I'm In!",
                           payload: "set_notifications_on"
                       }]
                    }]
                }
            }
        }]
    };

    // After the user signs up for the first time, send them a notification
    // in the future
    createBroadcastLabel(recipientId, function(label) {
        var d = new Date();
        var newDateObj = new Date(d.getTime() + 1440*60000);
        var futureTime = newDateObj.toISOString();
        callBroadcastAPI(messageData, null, label, futureTime);
    });
}

/*
* Send game link
*
*/
function sendGamesMessage(recipientId) {
    var link = encodeURIComponent(GAME_ASSETS.itunesStoreUrl);
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
                        image_url: GAME_ASSETS.imageUrl,
                        buttons: [{
                            title: "Play",
                            type: "web_url",
                            url: REDEIRECT_URL+link,
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
                            subtitle: 'Trailer\n2m 30s',
                            image_url:  TRAILERS[0].img,
                            buttons: [{
                                type: "postback",
                                title: "Watch",
                                payload: "watch_trailer_0"
                            }]
                        },
                        {
                            title: "Jurassic World Fallen Kingdom",
                            subtitle: "Behind the Scenes\n2m 36s",
                            image_url:  TRAILERS[1].img,
                            buttons: [{
                                type: "postback",
                                title: "Watch",
                                payload: "watch_trailer_1"
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
function sendTrailerMessage(recipientId, id) {
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
                            attachment_id: id
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send an individual image
*
*/
function sendImageMesage(recipientId, id) {
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
                            media_type: 'image',
                            attachment_id: id
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
* Send a list of locations and directions using the Google Maps API
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
            + '&key=' + GOOGLE_MAP_KEY;
        };

        var buildDirectionsUrl = function(otherLoc) {
            var directionsUrl = 'https://maps.google.com/?q='+otherLoc;
            var link = encodeURIComponent(directionsUrl);
            return REDIRECT_URL + link;
        };

        var elements = locations.map(function(l) {
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

                sendStoresLocationMessage(
                    recipientId, stores.slice(0,3), location.lat+","+location.lng
                );

            }
        }
        else {
            console.error("Failed calling Send API", response.statusCode,
                response.statusMessage, body.error);
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
                            image_url: NEWS_ARTICLES.article1.imageUrl,
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": NEWS_ARTICLES.article1.articleUrl,
                                "messenger_extensions": true,
                                "webview_height_ratio": "tall"
                            }]
                        },
                        {
                            title: "Watch ‘Jurassic World Alive’ Trailer for ‘Pokemon Go’ "
                                + "Take on ‘Jurassic World’ (EXCLUSIVE)",
                            subtitle: "Article\nVariety",
                            image_url: NEWS_ARTICLES.article2.imageUrl,
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": NEWS_ARTICLES.article2.articleUrl,
                                "messenger_extensions": true,
                                "webview_height_ratio": "tall"
                            }]
                        },
                        {
                            title: "Jurassic World Evolution: 6 Quick Facts You Should Know",
                            subtitle: "Article\nCultured Vultures",
                            image_url: NEWS_ARTICLES.article3.imageUrl,
                            buttons: [{
                                "title": "Read",
                                "type": "web_url",
                                "url": NEWS_ARTICLES.article2.articleUrl,
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
* Send a list of news articles
*
*/
function sendGalleryMessage(recipientId) {
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
                            title: "Image 1",
                            image_url: GALLERY[0].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_0"
                            }]
                        },
                        {
                            title: "Image 2",
                            image_url: GALLERY[1].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_1"
                            }]
                        },
                        {
                            title: "Image 3",
                            image_url: GALLERY[2].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_2"
                            }]
                        },
                        {
                            title: "Image 4",
                            image_url: GALLERY[3].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_3"
                            }]
                        },
                        {
                            title: "Image 5",
                            image_url: GALLERY[4].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_4"
                            }]
                        },
                        {
                            title: "Image 6",
                            image_url: GALLERY[5].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_5"
                            }]
                        },
                        {
                            title: "Image 7",
                            image_url: GALLERY[6].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_6"
                            }]
                        },
                        {
                            title: "Image 8",
                            image_url: GALLERY[7].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_7"
                            }]
                        },
                        {
                            title: "Image 9",
                            image_url: GALLERY[8].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_8"
                            }]
                        },
                        {
                            title: "Image 10",
                            image_url: GALLERY[9].img,
                            buttons: [{
                                type: "postback",
                                title: "View Image",
                                payload: "view_gallery_9"
                            }]
                        }
                    ]
                }
            }
        }
    };

    callSendAPI(messageData);
}

function sendTicketMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            quick_replies: QUICK_REPLIES,
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Fandango",
                    buttons: [{
                        "title": "View Showtimes",
                        "type": "web_url",
                        "url": SHOWTIMES_URL,
                        "messenger_extensions": true,
                        "webview_height_ratio": "full"
                    }]
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
        sendGifMessage(recipientId, showAR);
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
                        image_url: POSTER_URL,
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
                        image_url: MOVIES_ANYWHERE_URL,
                        buttons: [{
                            title: "Redeem",
                            type: "web_url",
                            url: REDEEM_URL,
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
    var link = encodeURIComponent(AR_STUDIO_PLAYER_URL);
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
                        attachment_id: AR_IMAGE_ID,
                        buttons: [{
                            title: "Unlock",
                            type: "web_url",
                            url: REDIRECT_URL + link,
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
            text: "The secret event is 1 week away. It won't be long, the "
                + "Fallen Kingdom will be taking over a location near you!"
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
                text: "The Fallen Kingdom is here! There are life size Jurassic World "
                    + "Dinosaurs at selected retail locations near you. You'll even get "
                    + "to take one home with you. Search for the closest location by clicking below.",
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
                text: "There's one week left! Have you seen the Jurassic Dinosaurs "
                    + "yet? Search for them here.",
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
            text: message
        }
    };

    callSendAPI(messageData, function() {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                quick_replies: QUICK_REPLIES,
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "button",
                        text: "Click here to enter the Contest.  We'll let you know if you win.",
                        buttons:[{
                            type: "postback",
                            title: "Enter Contest",
                            payload: "enter_contest"
                        }]
                    }
                }
            }
        };
        callSendAPI(messageData);
    });
}

/*
* Send a message about the contest winner
* Wait a few seconds to simulate the contest in-play
*
*/
function sendEnterContestMessage(recipientId) {
    sendQuickActions(recipientId);

    setTimeout(function() {
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                text: "Congratulations!! You've won the Contest."
            }
        };
        callSendAPI(messageData, function() {
            sendImageMesage(recipientId, ENTER_CONTEST_IMAGE_ID);
        });
    }, 10000);
}

/*
* Call the Send API. The message data goes in the body. If successful, we'll
* get the message id in a response
*
*/
function callSendAPI(messageData, callback) {
    PAGE_ACCESS_TOKENS.forEach(function(pageAccessToken) {
        request({
            uri: 'https://graph.facebook.com/v2.6/me/messages',
            qs: { access_token: pageAccessToken },
            method: 'POST',
            json: messageData

        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var recipientId = body.recipient_id;
                var messageId = body.message_id;

                if (messageId) {
                    console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
                }
                else {
                    console.log("Successfully called Send API for recipient %s",
                    recipientId);
                }

                if (callback) {
                    callback(recipientId);
                }

            }
            else {
                console.error("Failed calling Send API", response.statusCode,
                    response.statusMessage, body.error);
            }
        });
    });
}

/*
* Call the Broadcast API
*
*/
function callBroadcastAPI(messageData, callback, label, timestamp) {
    PAGE_ACCESS_TOKENS.forEach(function(pageAccessToken) {
        request({
            uri: 'https://graph.facebook.com/v2.11/me/message_creatives',
            qs: { access_token: pageAccessToken },
            method: 'POST',
            json: messageData
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var messageId = body.message_creative_id;

                if (messageId) {
                    console.log("Successfully sent message with id %s to recipient %s",
                    messageId);
                    var body = {
                        message_creative_id: messageId,
                        notification_type: "REGULAR",
                        messaging_type: "MESSAGE_TAG"
                    };

                    if (label) { body.custom_label_id = label; }

                    if (timestamp) { body.schedule_time = timestamp; }

                    request({
                        uri: 'https://graph.facebook.com/v2.11/me/broadcast_messages',
                        qs: { access_token: pageAccessToken },
                        method: 'POST',
                        json: body
                    }, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var messageId = body.broadcast_id;

                            if (messageId) {
                                console.log("Successfully sent message with id %s to recipient %s",
                                messageId);
                            }

                            if (callback) {
                                callback();
                            }
                        }
                        else {
                            console.error("Failed calling Broadcast API",
                                response.statusCode, response.statusMessage, body.error);
                        }
                    });
                }
            }
            else {
                console.error("Failed calling Broadcast API", response.statusCode,
                    response.statusMessage, body.error);
            }
        });
    });
}

/*
* Create broadcast label
*
*/
function createBroadcastLabel(psid, callback) {
    var labelName = '24-hour-msg-'+psid+'-'+(Date.now());
    PAGE_ACCESS_TOKENS.forEach(function(pageAccessToken) {
        request({
            uri: 'https://graph.facebook.com/v2.11/me/custom_labels',
            qs: { access_token: pageAccessToken },
            method: 'POST',
            json: { name: labelName }
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var id = body.id;

                if (id) {
                    console.log("Successfully created label with id %s",id);

                    request({
                        uri: 'https://graph.facebook.com/v2.11/' + id + '/label',
                        qs: { access_token: pageAccessToken },
                        method: 'POST',
                        json: { user: psid }
                    }, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var messageId = body.broadcast_id;

                            if (messageId) {
                                console.log("Successfully associated label id %s to recipient %s",
                                messageId, psid);
                            }

                            if (callback) {
                                callback(id);
                            }
                        }
                        else {
                            console.error("Failed associating psid to label",
                                response.statusCode, response.statusMessage, body.error);
                        }
                    });
                }
            }
            else {
                console.error("Failed creating label", response.statusCode,
                    response.statusMessage, body.error);
            }
        });
    });
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
