var inputTag = document.createElement('div');
inputTag.style.cssText = 'position:absolute; padding: 5px; border: solid 1px #000';
inputTag.draggable = true;
inputTag.ondragend = function(e) {
  var rect = e.target.getBoundingClientRect();
  inputTag.style.left = e.pageX;
  inputTag.style.top  = e.pageY - rect.height;
}

var text = document.createElement('textarea');
text.id = 'tag_text';
text.style.cssText = 'width: 20em; height: 4em';

var button = document.createElement('input');
button.type = 'button';
button.value = 'post';
button.onclick = function(e) {
}

inputTag.appendChild(text);
inputTag.appendChild(button);

var body = document.getElementsByTagName('body')[0];
body.ondblclick = function(e) {
  inputTag.style.left = e.pageX;
  inputTag.style.top  = e.pageY;
  body.appendChild(inputTag);
}
