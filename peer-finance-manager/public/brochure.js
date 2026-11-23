document.getElementById("downloadPdfBtn").addEventListener("click", function () {
  document.title = document.title.replace(/[:\s]+/g, "-");
  window.print();
});
