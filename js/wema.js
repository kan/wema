/* wema v3.0 - https://github.com/kan/wema */
(function($){
    var inputTag = $('<div style="position:absolute; padding: 5px; border: solid 1px #000"' +
                          'draggable="true" />');
    inputTag.bind('dragend', function(e) {
      var rect = e.target.getBoundingClientRect();
      $(this).css('left', e.pageX)
             .css('top',  e.pageY - rect.height);
    })
      .append('<textarea id="tag_text" style="width: 20em; height: 4em"></textarea><br />')
      .append('<input type="button" value="close" />')
      .append('<input type="button" value="post" />')
      .hide();

    $('body').append(inputTag)
             .bind('dblclick', function(e) {
      inputTag.css('left', e.pageX)
              .css('top',  e.pageY)
              .show();
    });

}(Zepto || jQuery));

