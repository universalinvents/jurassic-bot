var url = 'https://itunes.apple.com/ca/app/jurassic-world-alive/id1231085864';

window.onload = function() {
    // Load the Messenger Extensions JS SDK
    (function(d, s, id){
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) {return;}
        js = d.createElement(s); js.id = id;
        js.src = "//connect.facebook.net/en_US/messenger.Extensions.js";
        fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'Messenger'));
};

// Wait for the Messenger Extensions SDK load event
window.extAsyncInit = function() {
    var url = decodeURIComponent(location.href.split("?u=")[1]);
    window.open(url, "_self");
    setTimeout(function() {
        MessengerExtensions.requestCloseBrowser(function success() {
          // webview closed
        }, function error(err) {
          // an error occurred
        });
    }, 2000);
};
