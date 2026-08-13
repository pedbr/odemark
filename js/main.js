/* Ödemark — site behaviour. No network requests, no storage beyond
   the field-note demo (localStorage, this device only). */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // hero ring draws itself in once, cold start only
  var sym = document.querySelector(".hero-symbol");
  if (sym) requestAnimationFrame(function () { sym.classList.add("draw"); });

  // hero media: stills are painted in CSS from first frame (mist.jpg).
  // Video takes over only if /img/hero.mp4 actually plays. A missing
  // file — or Cloudflare serving 404.html as the mp4 — must never
  // leave a black <video> on top of hidden stills.
  var heroVideo = document.getElementById("hero-video");
  if (heroVideo) {
    var stills = document.querySelectorAll(".hero-still");
    var media = heroVideo.parentElement;
    var playing = false, carouselTimer = null;

    var startCarousel = function () {
      if (reduced || stills.length < 2 || carouselTimer) return;
      var i = 0;
      for (var s = 0; s < stills.length; s++) stills[s].classList.toggle("on", s === 0);
      carouselTimer = setInterval(function () {
        stills[i].classList.remove("on");
        i = (i + 1) % stills.length;
        stills[i].classList.add("on");
      }, 9000);
    };

    var dropVideo = function () {
      if (!heroVideo || !heroVideo.parentNode) return;
      heroVideo.remove();
      heroVideo = null;
      if (media) media.classList.remove("has-video");
      startCarousel();
    };

    heroVideo.addEventListener("playing", function () {
      playing = true;
      if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
      if (media) media.classList.add("has-video");
    });
    heroVideo.addEventListener("error", dropVideo);
    var src = heroVideo.querySelector("source");
    if (src) src.addEventListener("error", dropVideo);

    if (reduced) {
      heroVideo.removeAttribute("autoplay");
      heroVideo.pause();
      dropVideo();
    } else {
      startCarousel();
      setTimeout(function () { if (!playing) dropVideo(); }, 2000);
    }
  }

  // nav hairline after first scroll
  var nav = document.querySelector(".nav");
  function onScroll() {
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // mobile menu
  var navToggle = document.querySelector(".nav-toggle");
  if (nav && navToggle) {
    var closeMenu = function () {
      nav.classList.remove("menu-open");
      navToggle.setAttribute("aria-expanded", "false");
    };
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("menu-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  // reveals — opacity + 4px, staggered ≤80ms (motion charter)
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // the register shift — the surface becomes the notebook at the library
  var shiftPoint = document.getElementById("library");
  if (shiftPoint) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        document.documentElement.classList.toggle("register-library",
          en.isIntersecting || en.boundingClientRect.top < 0);
      });
    }, { rootMargin: "-30% 0px -55% 0px" });
    sio.observe(shiftPoint);
  }

  // field note — kept in this browser, sent nowhere
  var note = document.getElementById("field-note");
  if (note) {
    try {
      var saved = localStorage.getItem("odemark-note");
      if (saved) note.value = saved;
    } catch (e) {}
    note.addEventListener("input", function () {
      try { localStorage.setItem("odemark-note", note.value); } catch (e) {}
    });
  }

  // episode facades — youtube-nocookie loads only on explicit click
  document.querySelectorAll("button.thumb[data-yt]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-yt");
      if (!id) return;
      var wrap = document.createElement("div");
      wrap.className = "thumb";
      wrap.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1" title="' + (btn.getAttribute("data-title") || "") +
        '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>';
      btn.replaceWith(wrap);
    });
  });

  // region list — endpoint wired at deploy; until then the form only confirms
  var form = document.getElementById("region-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var endpoint = form.getAttribute("data-endpoint");
      var email = form.querySelector('input[type="email"]').value.trim();
      if (!email) return;
      if (endpoint) {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, lang: document.documentElement.lang })
        }).catch(function () {});
      }
      form.classList.add("sent");
    });
  }
})();
