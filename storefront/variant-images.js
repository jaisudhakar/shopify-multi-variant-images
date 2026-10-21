/*
 * Multi Variant Images — storefront script.
 *
 * Shows only the images assigned to the selected colour on product pages.
 * Two modes, set by data-mvi-mode on each [data-mvi-root]:
 *  - "theme": filters the theme's own gallery (app embed)
 *  - "block": drives the app's own gallery block
 */
(function () {
  "use strict";

  if (window.MultiVariantImages) return;

  var DEFAULT_ITEM_SELECTOR = [
    "[data-media-id]",
    ".thumbnail-list__item",
    "[data-thumbnail-id]",
    "[data-image-id]",
  ].join(",");
  var ID_ATTRIBUTES = [
    "data-media-id",
    "data-target",
    "data-thumbnail-id",
    "data-image-id",
    "data-media",
  ];

  function numericId(value) {
    var match = String(value == null ? "" : value).match(/(\d+)\s*$/);
    return match ? match[1] : null;
  }

  function normalize(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase();
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function markReady() {
    document.documentElement.classList.add("mvi-ready");
  }

  /* ------------------------------------------------------------------------ */
  /* Data                                                                      */
  /* ------------------------------------------------------------------------ */

  function Model(data) {
    var config = data.config || {};
    var optionName = normalize(config.optionName);
    var optionIndex = -1;
    var option = null;

    (data.options || []).forEach(function (candidate, index) {
      if (optionIndex === -1 && normalize(candidate.name) === optionName) {
        optionIndex = index;
        option = candidate;
      }
    });

    this.data = data;
    this.settings = data.settings || {};
    this.optionIndex = optionIndex;
    this.option = option;
    this.productMedia = (data.media || []).map(String);

    // option value name (normalized) -> ordered media ids
    var byName = {};
    var assigned = {};
    var stored = config.values || [];

    if (option) {
      option.values.forEach(function (value) {
        var entry = null;
        for (var i = 0; i < stored.length; i++) {
          if (numericId(stored[i].id) === String(value.id)) entry = stored[i];
        }
        if (!entry) {
          for (var j = 0; j < stored.length; j++) {
            if (normalize(stored[j].name) === normalize(value.name))
              entry = stored[j];
          }
        }
        var media = entry
          ? (entry.media || []).map(numericId).filter(Boolean)
          : [];
        byName[normalize(value.name)] = media;
        media.forEach(function (id) {
          assigned[id] = true;
        });
      });
    }

    this.byName = byName;
    this.shared = this.productMedia.filter(function (id) {
      return !assigned[id];
    });
  }

  Model.prototype.isColorValue = function (value) {
    return Object.prototype.hasOwnProperty.call(this.byName, normalize(value));
  };

  Model.prototype.colorForVariant = function (variantId) {
    if (this.optionIndex === -1 || !variantId) return null;
    var variants = this.data.variants || [];
    for (var i = 0; i < variants.length; i++) {
      if (String(variants[i].id) === String(variantId)) {
        return variants[i].options[this.optionIndex];
      }
    }
    return null;
  };

  /** Ordered media ids to show for a colour, or null to show everything. */
  Model.prototype.mediaFor = function (color) {
    var media = color ? this.byName[normalize(color)] || [] : [];
    if (media.length) {
      if (!this.settings.includeShared) return media;
      return media.concat(
        this.shared.filter(function (id) {
          return media.indexOf(id) === -1;
        }),
      );
    }
    if (this.settings.fallback === "shared" && this.shared.length)
      return this.shared;
    return null;
  };

  /* ------------------------------------------------------------------------ */
  /* Selected colour detection                                                 */
  /* ------------------------------------------------------------------------ */

  /** The section that holds this product's variant picker and gallery. */
  function findScope(productId) {
    var idInput = document.querySelector(
      'form[action*="/cart/add"] input[name="product-id"][value="' +
        productId +
        '"]',
    );
    var form = idInput
      ? idInput.form
      : document.querySelector('main form[action*="/cart/add"]');
    return (
      (form && (form.closest(".shopify-section") || form.closest("main"))) ||
      document.querySelector("main") ||
      document.body
    );
  }

  function selectedColor(model, scope) {
    var name = model.option ? model.option.name : "";

    // 1. Native inputs named after the option: options[Color]
    var named = scope.querySelectorAll('[name="options[' + name + ']"]');
    for (var i = 0; i < named.length; i++) {
      var el = named[i];
      if ((el.type === "radio" && el.checked) || el.tagName === "SELECT") {
        if (model.isColorValue(el.value)) return el.value;
      }
    }

    // 2. Any checked radio / select / selected swatch carrying a colour value
    var candidates = scope.querySelectorAll(
      'input[type="radio"]:checked, select, [aria-checked="true"][data-value], [aria-selected="true"][data-value], .is-selected[data-value], .active[data-value]',
    );
    for (var k = 0; k < candidates.length; k++) {
      var candidate = candidates[k];
      if (candidate.closest("[data-mvi-root]")) continue;
      var value =
        candidate.tagName === "SELECT" || candidate.tagName === "INPUT"
          ? candidate.value
          : candidate.getAttribute("data-value");
      if (model.isColorValue(value)) return value;
    }

    // 3. The selected variant (URL or the form's hidden id input)
    var fromUrl = new URLSearchParams(window.location.search).get("variant");
    var color = model.colorForVariant(fromUrl);
    if (color) return color;

    var idField = scope.querySelector('form[action*="/cart/add"] [name="id"]');
    color = model.colorForVariant(idField && idField.value);
    if (color) return color;

    return model.colorForVariant(model.data.initialVariantId);
  }

  /* ------------------------------------------------------------------------ */
  /* Theme gallery (app embed)                                                 */
  /* ------------------------------------------------------------------------ */

  function mediaIdOf(element) {
    for (var i = 0; i < ID_ATTRIBUTES.length; i++) {
      var id = numericId(element.getAttribute(ID_ATTRIBUTES[i]));
      if (id) return id;
    }
    var nested = element.querySelector("[data-media-id]");
    return nested ? numericId(nested.getAttribute("data-media-id")) : null;
  }

  function ThemeGallery(model, scope) {
    this.model = model;
    this.scope = scope;
    this.selector = model.settings.itemSelector || DEFAULT_ITEM_SELECTOR;
  }

  ThemeGallery.prototype.apply = function (media) {
    var productMedia = this.model.productMedia;
    var visible = media
      ? media.reduce(function (acc, id) {
          acc[id] = true;
          return acc;
        }, {})
      : null;
    var items = this.scope.querySelectorAll(this.selector);
    var changed = false;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.closest("[data-mvi-root]")) continue;
      var id = mediaIdOf(item);
      // Never touch elements that aren't this product's media.
      if (!id || productMedia.indexOf(id) === -1) continue;

      var hide = visible ? !visible[id] : false;
      if (item.classList.contains("mvi-hidden") !== hide) {
        item.classList.toggle("mvi-hidden", hide);
        changed = true;
      }
    }

    if (changed) this.resetPosition(media);
  };

  ThemeGallery.prototype.resetPosition = function (media) {
    var scope = this.scope;
    // Scroll sliders back to the first visible image.
    var lists = scope.querySelectorAll(
      ".product__media-list, .slider, [data-mvi-gallery-hide]",
    );
    for (var i = 0; i < lists.length; i++) {
      if (lists[i].scrollLeft || lists[i].scrollTop)
        lists[i].scrollTo({ left: 0, top: 0 });
    }

    // Activate the first visible thumbnail if the current one was hidden.
    if (media && media.length) {
      var active = scope.querySelector(
        '.thumbnail[aria-current="true"], [aria-current="true"][data-target]',
      );
      var activeItem = active && active.closest(this.selector);
      if (
        !active ||
        (activeItem && activeItem.classList.contains("mvi-hidden"))
      ) {
        var first = scope.querySelector(
          ".thumbnail-list__item:not(.mvi-hidden) button, [data-target]:not(.mvi-hidden) button",
        );
        if (first) first.click();
      }
    }

    // Let theme sliders recalculate slide counts / dots.
    window.dispatchEvent(new Event("resize"));
  };

  /* ------------------------------------------------------------------------ */
  /* App gallery block                                                         */
  /* ------------------------------------------------------------------------ */

  function BlockGallery(model, root) {
    var self = this;
    this.model = model;
    this.root = root;
    this.track = root.querySelector("[data-mvi-track]");
    this.thumbs = root.querySelector("[data-mvi-thumbs]");
    this.counter = root.querySelector("[data-mvi-counter]");
    this.index = 0;

    root.addEventListener("click", function (event) {
      var thumb = event.target.closest("[data-mvi-thumb]");
      if (thumb) return self.goToId(thumb.getAttribute("data-mvi-thumb"));
      if (event.target.closest("[data-mvi-prev]"))
        return self.go(self.index - 1);
      if (event.target.closest("[data-mvi-next]"))
        return self.go(self.index + 1);
    });

    this.track.addEventListener(
      "scroll",
      debounce(function () {
        var slides = self.visibleSlides();
        var width = self.track.clientWidth || 1;
        self.index = Math.max(
          0,
          Math.min(
            slides.length - 1,
            Math.round(self.track.scrollLeft / width),
          ),
        );
        self.update();
      }, 60),
    );

    root.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") self.go(self.index - 1);
      if (event.key === "ArrowRight") self.go(self.index + 1);
    });
  }

  BlockGallery.prototype.visibleSlides = function () {
    return Array.prototype.filter.call(this.track.children, function (slide) {
      return !slide.hidden;
    });
  };

  BlockGallery.prototype.apply = function (media) {
    var key = media ? media.join(",") : "*";
    if (key === this.key) return;
    this.key = key;

    [this.track, this.thumbs].forEach(function (list) {
      if (!list) return;
      var items = Array.prototype.slice.call(list.children);
      items.forEach(function (item) {
        item.hidden = media
          ? media.indexOf(item.getAttribute("data-mvi-media-id")) === -1
          : false;
      });
      if (media) {
        // Re-order so the colour's images appear in the order chosen in the admin.
        media.forEach(function (id) {
          var item = list.querySelector('[data-mvi-media-id="' + id + '"]');
          if (item) list.appendChild(item);
        });
        items.forEach(function (item) {
          if (item.hidden) list.appendChild(item);
        });
      }
    });

    this.root.classList.toggle(
      "mvi-gallery--single",
      this.visibleSlides().length < 2,
    );
    this.go(0, true);
  };

  BlockGallery.prototype.go = function (index, instant) {
    var slides = this.visibleSlides();
    if (!slides.length) return;
    this.index = (index + slides.length) % slides.length;
    this.track.scrollTo({
      left: slides[this.index].offsetLeft - this.track.offsetLeft,
      behavior: instant ? "auto" : "smooth",
    });
    this.update();
  };

  BlockGallery.prototype.goToId = function (id) {
    var slides = this.visibleSlides();
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getAttribute("data-mvi-media-id") === id) return this.go(i);
    }
  };

  BlockGallery.prototype.update = function () {
    var slides = this.visibleSlides();
    var current = slides[this.index];
    var currentId = current && current.getAttribute("data-mvi-media-id");
    if (this.counter)
      this.counter.textContent =
        slides.length > 1 ? this.index + 1 + " / " + slides.length : "";
    if (!this.thumbs) return;
    Array.prototype.forEach.call(this.thumbs.children, function (thumb) {
      var isCurrent = thumb.getAttribute("data-mvi-media-id") === currentId;
      thumb.classList.toggle("is-active", isCurrent);
      var button = thumb.querySelector("button");
      if (button)
        button.setAttribute("aria-current", isCurrent ? "true" : "false");
      if (
        isCurrent &&
        thumb.scrollIntoView &&
        thumb.parentElement.scrollWidth > thumb.parentElement.clientWidth
      ) {
        thumb.parentElement.scrollTo({
          left: thumb.offsetLeft - thumb.parentElement.offsetLeft - 8,
          behavior: "smooth",
        });
      }
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Controller                                                                */
  /* ------------------------------------------------------------------------ */

  var instances = [];

  function init(root) {
    if (root.__mvi) return;
    var script = root.querySelector("[data-mvi-data]");
    if (!script) return;

    var data;
    try {
      data = JSON.parse(script.textContent);
    } catch (error) {
      return;
    }

    var model = new Model(data);
    var mode = root.getAttribute("data-mvi-mode");
    var scope = findScope(data.productId);
    var view =
      mode === "block"
        ? new BlockGallery(model, root)
        : new ThemeGallery(model, scope);
    var instance = {
      root: root,
      model: model,
      scope: scope,
      view: view,
      color: undefined,
    };

    instance.refresh = function (force) {
      if (!document.contains(root)) return;
      var color = selectedColor(model, instance.scope);
      if (!force && color === instance.color) return;
      instance.color = color;
      view.apply(model.mediaFor(color));
      root.dispatchEvent(
        new CustomEvent("mvi:change", {
          bubbles: true,
          detail: { color: color },
        }),
      );
    };

    root.__mvi = instance;
    instances.push(instance);
    instance.refresh(true);

    if (mode === "theme") {
      // Themes often re-render the gallery after a variant change; re-apply.
      var observer = new MutationObserver(
        debounce(function () {
          instance.refresh(true);
        }, 50),
      );
      observer.observe(scope, { childList: true, subtree: true });
    }
  }

  function initAll() {
    document.querySelectorAll("[data-mvi-root]").forEach(init);
    markReady();
  }

  function refreshAll() {
    instances = instances.filter(function (instance) {
      return document.contains(instance.root);
    });
    instances.forEach(function (instance) {
      instance.refresh(false);
    });
  }

  var scheduleRefresh = (function () {
    var quick = debounce(refreshAll, 30);
    var late = debounce(refreshAll, 350);
    return function () {
      quick();
      late();
    };
  })();

  // Variant pickers fire change/click; some themes only update the URL.
  document.addEventListener("change", scheduleRefresh, true);
  document.addEventListener("click", scheduleRefresh, true);
  window.addEventListener("popstate", scheduleRefresh);
  [
    "variant:change",
    "variant:changed",
    "variantChange",
    "variant:update",
    "on:variant:change",
  ].forEach(function (name) {
    document.addEventListener(name, scheduleRefresh);
  });
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      scheduleRefresh();
      return result;
    };
  });
  // Last-resort safety net for themes that change variants silently.
  setInterval(function () {
    if (!document.hidden && instances.length) refreshAll();
  }, 700);

  // Theme editor support.
  document.addEventListener("shopify:section:load", initAll);
  document.addEventListener("shopify:block:select", initAll);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  window.MultiVariantImages = { refresh: refreshAll, init: initAll };
})();
