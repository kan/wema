/* wema v3.0 - https://github.com/kan/wema */
(function($){

    var TAGDIV = '<div style="position:absolute; padding: 5px; border: solid 1px #000"' +
                      'draggable="true" />';

    var tagDragHandler = function(e) {
        var rect = e.target.getBoundingClientRect();
        $(this).css('left', e.pageX)
               .css('top',  e.pageY - rect.height);
    };

    var inputTag = $(TAGDIV);

    var tagText = $('<textarea style="width: 20em; height: 4em"></textarea>');

    var closeBtn = $('<input type="button" value="close" />')
      .bind('click', function(e) { tagText.val(''); inputTag.hide() });

    var postBtn = $('<input type="button" value="post" />')
      .bind('click', function(e) {
        var tag = $(TAGDIV).text(tagText.val())
                           .css('left', inputTag.css('left'))
                           .css('top',  inputTag.css('top'))
                           .bind('dragend', tagDragHandler);
        $('body').append(tag);
        tagText.val('');
        inputTag.hide();
      });

    inputTag.bind('dragend', tagDragHandler)
            .append(tagText).append('<br />')
            .append(closeBtn)
            .append(postBtn)
            .hide();

    $('body').append(inputTag)
             .bind('dblclick', function(e) {
      inputTag.css('left', e.pageX)
              .css('top',  e.pageY)
              .show();
    });

}(Zepto || jQuery));

