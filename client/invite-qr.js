    // Scannable invite QR via QR image API (teacher creates invites online).
    function paintInviteQr(box, text) {
      if (!box) return;
      box.hidden = !text;
      if (!text) { box.innerHTML = ""; return; }
      const img = document.createElement("img");
      img.width = 180;
      img.height = 180;
      img.alt = "Invite QR code";
      img.decoding = "async";
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&ecc=M&margin=8&data=" + encodeURIComponent(text);
      img.onerror = () => {
        box.innerHTML = '<p class="hint">QR image unavailable. Copy the link or open it on the student phone.</p>';
      };
      box.replaceChildren(img);
    }
