    // Encode locally: invite tokens must never leave the application for rendering.
    function paintInviteQr(box, text) {
      if (!box) return;
      box.hidden = !text;
      if (!text) { box.innerHTML = ""; return; }
      try {
        const qr=createInviteQr(0,'M');
        qr.addData(String(text),'Byte');
        qr.make();
        const img = document.createElement("img");
        img.width = 180;
        img.height = 180;
        img.alt = "Invite QR code";
        img.decoding = "async";
        img.src=qr.createDataURL(4,16);
        box.replaceChildren(img);
      } catch {
        box.innerHTML = '<p class="hint">QR unavailable. Copy the invite link instead.</p>';
      }
    }
