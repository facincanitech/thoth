const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function loopTyping(element, phrases, speed = 55, pause = 1400) {
  if (!element) return;
  if (reducedMotion) {
    element.textContent = phrases[0];
    return;
  }

  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;

  function tick() {
    const phrase = phrases[phraseIndex];
    element.textContent = phrase.slice(0, charIndex);

    if (!deleting && charIndex < phrase.length) {
      charIndex += 1;
      setTimeout(tick, speed);
      return;
    }

    if (!deleting) {
      deleting = true;
      setTimeout(tick, pause);
      return;
    }

    if (charIndex > 0) {
      charIndex -= 1;
      setTimeout(tick, 22);
      return;
    }

    deleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    setTimeout(tick, 450);
  }

  tick();
}

loopTyping(document.querySelector('#heroTyping'), [
  'eu consigo ler enquanto você digita',
  'e responder antes da mensagem chegar :)'
], 48, 1500);

loopTyping(document.querySelector('#featureTyping'), [
  'acho que Interestelar...',
  'não, espera — vamos de Matrix!',
  'fechado? 🍿'
], 58, 1050);

document.querySelector('#year').textContent = new Date().getFullYear();


fetch("../version.json?t=" + Date.now()).then(function (r) { return r.json() }).then(function (v) {
  document.querySelectorAll("[data-app-version]").forEach(function (el) { el.textContent = v.version })
}).catch(function () {})
