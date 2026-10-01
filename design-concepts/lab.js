(function () {
  var names = ["minimal", "premium", "playful"];
  var titles = ["Minimal Learning", "Premium Language Lab", "Modern Playful"];
  var board = document.getElementById("board");
  var source = document.getElementById("product");
  var view = "home";

  names.forEach(function (name, index) {
    var column = document.createElement("div");
    column.className = "column";
    column.innerHTML = "<h2>" + titles[index] + "</h2>";
    var frame = document.createElement("div");
    frame.className = "frame";
    var app = source.content.firstElementChild.cloneNode(true);
    app.dataset.concept = name;
    app.dataset.view = view;
    frame.appendChild(app);
    column.appendChild(frame);
    board.appendChild(column);
  });

  function paint() {
    document.querySelectorAll(".app").forEach(function (app) {
      app.dataset.view = view;
      app.querySelectorAll("[data-go]").forEach(function (button) {
        button.classList.toggle("on", button.getAttribute("data-go") === view);
      });
    });
    document.querySelectorAll("[data-screen-pick]").forEach(function (button) {
      button.classList.toggle("on", button.getAttribute("data-screen-pick") === view);
    });
  }

  document.querySelector(".lab").addEventListener("click", function (event) {
    var pick = event.target.closest("[data-screen-pick]");
    if (pick) {
      view = pick.getAttribute("data-screen-pick");
      paint();
    }
    var width = event.target.closest("[data-width]");
    if (width) {
      board.classList.toggle("phone", width.getAttribute("data-width") === "phone");
      document.querySelectorAll("[data-width]").forEach(function (button) {
        button.classList.toggle("on", button === width);
      });
    }
  });

  board.addEventListener("click", function (event) {
    var go = event.target.closest("[data-go]");
    if (go) {
      view = go.getAttribute("data-go");
      paint();
      return;
    }
    var option = event.target.closest(".opt");
    if (!option || option.disabled) return;
    var quiz = option.closest("[data-quiz]");
    if (!quiz || quiz.dataset.locked) return;
    quiz.querySelectorAll(".opt").forEach(function (item) { item.classList.remove("is-on"); });
    option.classList.add("is-on");
  });

  var prompts = {
    Choice: "What does <b>give up</b> mean?",
    Type: "Type the Russian for <b>give up</b>.",
    Gap: "I almost ___ learning English.",
    Match: "Match humid, drizzle, and give up with their meanings.",
    Listen: "Listen, then choose the word you hear.",
    Flip: "<b>give up</b> — tap the card to see the meaning."
  };

  board.addEventListener("click", function (event) {
    var chip = event.target.closest(".types .chip");
    if (!chip) return;
    var study = chip.closest("[data-screen='study']");
    study.querySelectorAll(".chip").forEach(function (item) { item.classList.remove("on"); });
    chip.classList.add("on");
    study.querySelector("[data-prompt]").innerHTML = prompts[chip.textContent] || chip.textContent;
  });

  board.addEventListener("click", function (event) {
    var next = event.target.closest("[data-next]");
    if (!next) return;
    var quiz = next.closest("[data-quiz]");
    var chosen = quiz.querySelector(".opt.is-on");
    var note = quiz.querySelector(".feedback");
    if (!chosen) {
      note.hidden = false;
      note.textContent = "Choose an answer first.";
      return;
    }
    quiz.dataset.locked = "1";
    var right = chosen.dataset.answer === "stop";
    chosen.classList.add(right ? "is-ok" : "is-bad");
    if (!right) quiz.querySelector('[data-answer="stop"]').classList.add("is-ok");
    quiz.querySelectorAll(".opt").forEach(function (item) { item.disabled = true; });
    note.hidden = false;
    note.className = "feedback " + (right ? "ok" : "bad");
    note.textContent = right
      ? "Correct. give up means to stop trying. I almost gave up learning English."
      : "Not quite. The answer is Stop trying. The word and the sentence stay on the card.";
  });

  paint();
})();
