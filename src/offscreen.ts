chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "clipboard-write") {
    const textarea = document.getElementById("cb") as HTMLTextAreaElement;
    textarea.value = message.text;
    textarea.select();
    document.execCommand("copy");
    sendResponse({ ok: true });
  }
});
