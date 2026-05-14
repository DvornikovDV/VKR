(function () {
  var editor = document.getElementById("yaml-editor");
  if (!editor) {
    return;
  }

  fetch("/api/config")
    .then(function (response) { return response.json(); })
    .then(function (payload) {
      editor.value = payload.yaml || "";
    })
    .catch(function () {
      editor.value = "";
    });
}());
