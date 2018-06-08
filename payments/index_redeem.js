var ACCESS_TOKEN = 'EAACfutbOvNwBAFvOoC1C29PMLlrV9T95i6hfmEVaXxRS4S4QtKQH314K1izWWPlYWddaBXTYmIIVwXMZC7dKQnzFC2jQE73ge5k8FfZBw99fjUiMELLFBZBKhmHCXQ9IlNZAKN7ZAJNjSAaCmocczsZAvraLugZBXiffTnAjdot0AZDZD';

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

window.onload = function() {
    // Load the Messenger Extensions JS SDK
    (function(d, s, id){
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) {return;}
        js = d.createElement(s); js.id = id;
        js.src = "//connect.facebook.net/en_US/messenger.Extensions.js";
        fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'Messenger'));
    // var psid = 1543270259128342;
    // var link = encodeURIComponent('https://itunes.apple.com/us/app/ar-studio-player/id1231451896?mt=8');
    // var messageData = {
    //   recipient: {
    //     id: psid
    //   },
    //   message: {
    //     quick_replies: QUICK_REPLIES,
    //     attachment: {
    //       type: "template",
    //       payload: {
    //         template_type: "media",
    //         elements: [{
    //               media_type: "image",
    //               attachment_id: "247200862498201",
    //               buttons: [{
    //                   title: "Unlock",
    //                   type: "web_url",
    //                   url: "https://s3.us-east-2.amazonaws.com/jurassic-bot/games-ui/index.html?u="+link,
    //                   messenger_extensions: true,
    //                   webview_height_ratio: 'compact'
    //               }]
    //           }
    //         ]
    //       }
    //     }
    //   }
    // };
    //
    // $.ajax({
    //     url: "https://graph.facebook.com/v2.6/me/messages?access_token="+ACCESS_TOKEN,
    //     method: 'POST',
    //     data: messageData
    // }).done(function(data){
    // });
};

// Wait for the Messenger Extensions SDK load event
window.extAsyncInit = function() {
    MessengerExtensions.getContext('175624816606428',
      function success(thread_context){
          var psid = thread_context.psid;
          var link = encodeURIComponent('https://itunes.apple.com/us/app/ar-studio-player/id1231451896?mt=8');
          var messageData = {
            recipient: {
              id: psid
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
                    }
                  ]
                }
              }
            }
          };

          $.ajax({
              url: "https://graph.facebook.com/v2.6/me/messages?access_token="+ACCESS_TOKEN,
              method: 'POST',
              data: messageData
          }).done(function(data){

          });
      },
      function error(err){
          console.log(err);
        // error
      }
    );
};
