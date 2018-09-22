# Jurassic Bot

This sample project was built using the template generated by the
[Facebook Messenger QuickStart Guide](https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start)

The [Complete Guide](https://developers.facebook.com/docs/messenger-platform/implementation) goes deeper into the features available.

Visit the [dev site](https://developers.facebook.com/docs/messenger-platform/) to find out more details about the Messenger Platform.

## Messenger Platform Sample -- node.js

This project is an example server for creating a Jurassic World bot utilizing the Messenger Platform built in Node.js.

It contains the following functionality:

* Webhook (specifically for Messenger Platform events)
* Send API
* Broadcast API
* Other Messenger Platform features

The full tutorial can be found here: https://developers.facebook.com/docs/messenger-platform/quickstart

### Setup

Set the following parameters in `node/config/default.json` before running the sample.

| Placeholder          | Description                                                                                                                                        |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| ${APP_SECRET}        | This is the generated app secret for your Facebook Application.  All of your Facebook apps can be found here: https://developers.facebook.com/apps |
| ${PAGE_ACCESS_TOKEN} | This is the access token for this app to respond to your chosen Facebook page.                                                                     |
| ${GOOGLE_MAP_KEY}    | Part of this sample application uses the Google Maps API.  Generate a sample access token with the Maps API and insert it here.                    |
|                      |                                                                                                                                                    |

Replace values for `APP_ID` and `PAGE_ID` in `node/public/index.html`.  This is a simple landing page for the webhook.

Some of the values (e.g. `promo.gifId`) in the `node/config/default.json` file will contain references to `attachments` of media assets uploaded using the [Facebook Attachment Upload API](https://developers.facebook.com/docs/messenger-platform/reference/attachment-upload-api/).  As you'll see in this documentation, each request requires a `PAGE_ACCESS_TOKEN`, which is unique per Facebook page.  Therefore, you will need to upload your own assets and replace the values in the config file.

### Whitelisting Domains

All referenced external resources (e.g. www.google.com) must be whitelisted in the Facebook page settings under the **Message Platform** tab.  The following are domains that are referenced by this sample bot that should be added to the whitelist.

| Domain Name                                                                   |
|-------------------------------------------------------------------------------|
| https://www.slashgear.com/                                                    |
| https://c.slashgear.com/                                                      |
| https://41zxbw463fq733z1kl101n01-wpengine.netdna-ssl.com/                     |
| https://culturedvultures.com/                                                 |
| https://thumbor.forbes.com/                                                   |
| https://www.forbes.com/                                                       |
| https://itunes.apple.com/                                                     |
| https://is2-ssl.mzstatic.com/                                                 |
| https://maps.googleapis.com/                                                  |
| https://maps.googleapis.com/maps/api/                                         |
| https://www.google.com/                                                       |
| https://ia.media-imdb.com/                                                    |
| https://images-na.ssl-images-amazon.com/                                      |
| https://moviesanywhere.com/                                                   |
| https://horrorfuel.com/                                                       |
| https://is3.mzstatic.com/                                                     |
| https://s3.us-east-2.amazonaws.com/                                           |
| https://handoff-cdn.appadvice.com/                                            |
| https://maps.google.com/                                                      |
| https://cdn.vox-cdn.com/                                                      |
| https://variety.com/                                                          |
| https://mobile.fandango.com/                                                  |
| https://d1zzobb4u0984a.cloudfront.net/                                        |

### Run

You can start the server by running `npm start` int the node directory. However, the webhook must be at a public URL that the Facebook servers can reach. Therefore, running the server locally on your machine will not work.

You can run this example on a cloud service provider like Heroku, Google Cloud Platform or AWS. Note that webhooks *must* have a valid SSL certificate, signed by a certificate authority. Read more about setting up SSL for a [Webhook](https://developers.facebook.com/docs/graph-api/webhooks#setup).

### Webhook

All webhook code is in `node/app.js`. It is routed to the `/webhook` endpoint. More details are available at the [reference docs](https://developers.facebook.com/docs/messenger-platform/webhook-reference).

This sample bot app requires the following webhook events to be enabled for this Facebook app.  The settings can be found under **Product > Messenger > Settings** in FB app developer portal.
<INSERT TABLE>

| Domain Name          |
|----------------------|
| messages             |
| messaging_postbacks  |
| messaging_referrals  |

### Example Requests

Sample `curl` requests to the Facebook Messenger APIs can be found in **requirements.txt**

Example request use cases are as follows:

* Defining a greeting message
* Creating a persistent menu
* Uploading files using the Attachment Upload API
* Sending ad-hoc messages to users
