/*
 * Multi Variant Images — storefront script.
 *
 * Shows only the images assigned to the selected colour on product pages.
 * Two modes, set by data-mvi-mode on each [data-mvi-root]:
 *  - "theme": filters the theme's own gallery (app embed)
 *  - "block": drives the app's own gallery block
 *
 * `npm run build:storefront` builds one bundle per mode (MVI_MODE is replaced
 * at build time) so each stays small:
 *   extensions/variant-image-gallery/assets/variant-images-theme.js
 *   extensions/variant-image-gallery/assets/variant-images-block.js
 */
/* global MVI_MODE */
(function () {
  "use strict";

  var GLOBAL_KEY = "__mvi_" + MVI_MODE;
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

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

  /** Image file name without folder, size suffix or extension. */
  function fileKey(url) {
    if (!url) return null;
    var path = String(url)
      .trim()
      .split(/[?#\s]/)[0];
    var name = path.substring(path.lastIndexOf("/") + 1).toLowerCase();
    try {
      name = decodeURIComponent(name);
    } catch (error) {
      // keep as is
    }
    name = name
      .replace(/\.(jpe?g|png|gif|webp|avif|heic|svg)$/, "")
      .replace(/@\dx$/, "")
      .replace(/_crop_[a-z]+$/, "")
      .replace(
        /_(\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)$/,
        "",
      );
    return name || null;
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

    var fileToId = {};
    this.productMedia = (data.media || []).map(function (item) {
      if (item && typeof item === "object") {
        var key = fileKey(item.src);
        if (key) fileToId[key] = String(item.id);
        return String(item.id);
      }
      return String(item);
    });
    this.fileToId = fileToId;

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
    var key = normalize(value);
    return key !== "" && Object.prototype.hasOwnProperty.call(this.byName, key);
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

  /** Media id of an <img>/<source>/background element, matched by file name. */
  Model.prototype.mediaIdForImage = function (element) {
    var urls = [
      element.getAttribute("src"),
      element.getAttribute("data-src"),
      element.getAttribute("data-zoom"),
      element.getAttribute("data-zoom-src"),
      element.getAttribute("data-original"),
      (element.getAttribute("srcset") || "").split(",")[0],
      (element.getAttribute("data-srcset") || "").split(",")[0],
    ];
    var bg = element.style && element.style.backgroundImage;
    if (bg) urls.push(bg.replace(/^url\(["']?|["']?\)$/g, ""));
    for (var i = 0; i < urls.length; i++) {
      var key = fileKey(urls[i]);
      if (key && this.fileToId[key]) return this.fileToId[key];
    }
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
      : document.querySelector('main form[action*="/cart/add"]') ||
        document.querySelector('form[action*="/cart/add"]');
    return (
      (form && (form.closest(".shopify-section") || form.closest("main"))) ||
      document.querySelector("main") ||
      document.body
    );
  }

  var SELECTED_SELECTOR = [
    'input[type="radio"]:checked',
    'input[type="checkbox"]:checked',
    "select",
    '[aria-checked="true"]',
    '[aria-selected="true"]',
    '[aria-pressed="true"]',
    '[data-selected="true"]',
    ".is-selected",
    ".is-active",
    ".selected",
    ".active",
    ".swatch--active",
    ".swatch--selected",
  ].join(",");

  function candidateValues(element) {
    var values = [];
    if (element.tagName === "SELECT") {
      values.push(element.value);
      var option = element.options[element.selectedIndex];
      if (option) values.push(option.textContent);
    } else if (element.tagName === "INPUT") {
      values.push(element.value);
      if (element.labels && element.labels[0])
        values.push(element.labels[0].textContent);
    }
    [
      "data-value",
      "data-option-value",
      "data-variant-value",
      "data-swatch-value",
      "data-name",
      "title",
      "aria-label",
    ].forEach(function (attribute) {
      values.push(element.getAttribute(attribute));
    });
    var text = element.textContent;
    if (text && text.length < 60) values.push(text);
    return values;
  }

  function selectedColor(model, scope) {
    var name = model.option ? model.option.name : "";

    // 1. Native inputs named after the option: options[Color]
    var named = scope.querySelectorAll(
      '[name="options[' + name.replace(/"/g, '\\"') + ']"]',
    );
    for (var i = 0; i < named.length; i++) {
      var el = named[i];
      if ((el.type === "radio" && el.checked) || el.tagName === "SELECT") {
        if (model.isColorValue(el.value)) return el.value;
      }
    }

    // 2. Any checked input / select / selected swatch showing a colour value
    var candidates = scope.querySelectorAll(SELECTED_SELECTOR);
    for (var k = 0; k < candidates.length; k++) {
      var candidate = candidates[k];
      if (candidate.closest("[data-mvi-root]")) continue;
      var values = candidateValues(candidate);
      for (var v = 0; v < values.length; v++) {
        if (model.isColorValue(values[v])) return values[v].trim();
      }
    }

    // 3. The selected variant (URL or the form's id field)
    var fromUrl = new URLSearchParams(window.location.search).get("variant");
    var color = model.colorForVariant(fromUrl);
    if (color) return color;

    var idFields = scope.querySelectorAll(
      'form[action*="/cart/add"] [name="id"]',
    );
    for (var f = 0; f < idFields.length; f++) {
      color = model.colorForVariant(idFields[f].value);
      if (color) return color;
    }

    return model.colorForVariant(model.data.initialVariantId);
  }

  /* ------------------------------------------------------------------------ */
  /* Theme gallery (app embed)                                                 */
  /* ------------------------------------------------------------------------ */

  var ThemeGallery =
    MVI_MODE === "theme" &&
    (function () {
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

      // Never hide things inside variant pickers (swatches often reuse images).
      var EXCLUDE_SELECTOR = [
        "fieldset",
        "label",
        "select",
        "variant-picker",
        "variant-selects",
        "variant-radios",
        "product-recommendations",
        "cart-drawer",
        "cart-notification",
        "cart-items",
        '[id*="CartDrawer"]',
        '[class*="swatch"]',
        '[class*="Swatch"]',
        "[data-option-index]",
        "[data-option-position]",
        "[data-mvi-root]",
      ].join(",");

      function mediaIdOf(element) {
        for (var i = 0; i < ID_ATTRIBUTES.length; i++) {
          var id = numericId(element.getAttribute(ID_ATTRIBUTES[i]));
          if (id) return id;
        }
        var nested = element.querySelector("[data-media-id]");
        return nested ? numericId(nested.getAttribute("data-media-id")) : null;
      }

      function ThemeGallery(model) {
        this.model = model;
        this.selector = model.settings.itemSelector || DEFAULT_ITEM_SELECTOR;
        this.custom = Boolean(model.settings.itemSelector);
      }

      /** Gallery items in `scope` as [{ element, id }]. */
      ThemeGallery.prototype.findItems = function (scope) {
        var model = this.model;
        var found = [];
        var seen = [];

        function add(element, id) {
          if (!id || model.productMedia.indexOf(id) === -1) return;
          if (seen.indexOf(element) !== -1) return;
          seen.push(element);
          found.push({ element: element, id: id, how: "attribute" });
        }

        // a) Items carrying a media id (Dawn and most Shopify themes)
        var tagged = scope.querySelectorAll(this.selector);
        for (var i = 0; i < tagged.length; i++) {
          if (!this.custom && tagged[i].closest(EXCLUDE_SELECTOR)) continue;
          add(
            tagged[i],
            mediaIdOf(tagged[i]) || model.mediaIdForImage(tagged[i]),
          );
        }
        if (this.custom) return found;

        // b) Any image whose file belongs to this product (custom themes)
        var images = [];
        var nodes = scope.querySelectorAll(
          'img, source, [style*="background-image"]',
        );
        for (var j = 0; j < nodes.length; j++) {
          if (nodes[j].closest(EXCLUDE_SELECTOR)) continue;
          var id = model.mediaIdForImage(nodes[j]);
          if (id) images.push({ element: nodes[j], id: id });
        }

        // Climb from each image to the largest ancestor that holds only that
        // image — that's the slide / thumbnail to hide.
        images.forEach(function (image) {
          var node = image.element;
          var item = null;
          while (node.parentElement && node.parentElement !== scope) {
            var parent = node.parentElement;
            var mixed = images.some(function (other) {
              return other.id !== image.id && parent.contains(other.element);
            });
            if (mixed) {
              item = node;
              break;
            }
            node = parent;
          }
          if (!item || item.querySelector("input, select, form")) return;
          var covered = found.some(function (entry) {
            return entry.element === item || entry.element.contains(item);
          });
          if (!covered) {
            seen.push(item);
            found.push({ element: item, id: image.id, how: "image" });
          }
        });

        return found;
      };

      ThemeGallery.prototype.apply = function (media, scope) {
        var items = this.findItems(scope);
        if (!items.length && scope !== document.body) {
          scope = document.querySelector("main") || document.body;
          items = this.findItems(scope);
        }
        this.lastItems = items;

        var visible = {};
        (media || []).forEach(function (id) {
          visible[id] = true;
        });
        var changed = false;

        items.forEach(function (entry) {
          var hide = media ? !visible[entry.id] : false;
          if (entry.element.classList.contains("mvi-hidden") !== hide) {
            entry.element.classList.toggle("mvi-hidden", hide);
            changed = true;
          }
        });

        if (changed) this.resetPosition(media, scope);
        return items;
      };

      ThemeGallery.prototype.resetPosition = function (media, scope) {
        // Scroll native sliders back to the first visible image.
        var lists = scope.querySelectorAll(
          '.product__media-list, .slider, [class*="gallery"] ul, [class*="slider"], [class*="carousel"]',
        );
        for (var i = 0; i < lists.length; i++) {
          if (lists[i].scrollLeft || lists[i].scrollTop)
            lists[i].scrollTo({ left: 0, top: 0 });
        }

        // Dawn: activate the first visible thumbnail if the current one is hidden.
        if (media && media.length) {
          var active = scope.querySelector(
            '.thumbnail-list__item .thumbnail[aria-current="true"]',
          );
          var activeItem = active && active.closest(".thumbnail-list__item");
          if (activeItem && activeItem.classList.contains("mvi-hidden")) {
            var first = scope.querySelector(
              ".thumbnail-list__item:not(.mvi-hidden) button.thumbnail",
            );
            if (first) first.click();
          }
        }

        // Swiper / Flickity / Slick sliders used by many custom themes.
        scope
          .querySelectorAll(".swiper, .swiper-container")
          .forEach(function (el) {
            var swiper = el.swiper;
            if (!swiper) return;
            try {
              swiper.update();
              var index = Array.prototype.findIndex.call(
                swiper.slides,
                function (s) {
                  return !s.classList.contains("mvi-hidden");
                },
              );
              if (index > -1) swiper.slideTo(index, 0);
            } catch (error) {
              // ignore slider errors
            }
          });
        if (window.Flickity && window.Flickity.data) {
          scope.querySelectorAll(".flickity-enabled").forEach(function (el) {
            var flickity = window.Flickity.data(el);
            if (flickity) {
              flickity.resize();
              flickity.select(0, false, true);
            }
          });
        }
        if (window.jQuery) {
          window
            .jQuery(scope)
            .find(".slick-initialized")
            .each(function () {
              try {
                window.jQuery(this).slick("setPosition");
              } catch (error) {
                // ignore slider errors
              }
            });
        }

        // Let theme sliders recalculate slide counts / dots.
        window.dispatchEvent(new Event("resize"));
      };

      return ThemeGallery;
    })();

  /* ------------------------------------------------------------------------ */
  /* App gallery block                                                         */
  /* ------------------------------------------------------------------------ */

  var BlockGallery =
    MVI_MODE === "block" &&
    (function () {
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
        return Array.prototype.filter.call(
          this.track.children,
          function (slide) {
            return !slide.hidden;
          },
        );
      };

      BlockGallery.prototype.apply = function (media) {
        var key = media ? media.join(",") : "*";
        if (key === this.key) return null;
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
        return null;
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
          if (slides[i].getAttribute("data-mvi-media-id") === id)
            return this.go(i);
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

      return BlockGallery;
    })();

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

    var mode = root.getAttribute("data-mvi-mode");
    if (mode !== MVI_MODE) return;
    var model = new Model(data);
    var view =
      MVI_MODE === "block"
        ? new BlockGallery(model, root)
        : new ThemeGallery(model);
    var instance = { root: root, model: model, view: view, color: undefined };

    instance.refresh = function (force) {
      if (!document.contains(root)) return;
      // Re-resolve every time: themes may replace whole sections.
      var scope = findScope(data.productId);
      var color = selectedColor(model, scope);
      if (!force && color === instance.color) return;
      instance.color = color;
      var media = model.mediaFor(color);
      var items = view.apply(media, scope);
      if (DEBUG) report(model, scope, color, media, items, mode);
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

    if (MVI_MODE === "theme") {
      // Themes often re-render the gallery after a variant change; re-apply.
      var observer = new MutationObserver(
        debounce(function () {
          instance.refresh(true);
        }, 60),
      );
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Debugging: add ?mvi_debug=1 to a product page URL                         */
  /* ------------------------------------------------------------------------ */

  var DEBUG = /[?&]mvi_debug=1/.test(window.location.search);

  function report(model, scope, color, media, items, mode) {
    var log = window.console;
    log.groupCollapsed(
      "[Multi Variant Images] " + mode + " · colour: " + color,
    );
    log.log("Colour option:", model.option ? model.option.name : "NOT FOUND");
    log.log("Colours with images:", model.byName);
    log.log("Showing media ids:", media || "all (no images assigned)");
    log.log("Scope element:", scope);
    if (items) {
      log.log("Gallery items found:", items.length, items);
      items.forEach(function (entry) {
        entry.element.style.outline = entry.element.classList.contains(
          "mvi-hidden",
        )
          ? ""
          : "3px solid #2e7d32";
      });
      if (!items.length)
        log.warn(
          "No gallery images found: set 'Gallery item selector' or use the gallery block",
        );
    }
    log.groupEnd();
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

  window.MultiVariantImages = window.MultiVariantImages || {};
  window.MultiVariantImages[MVI_MODE] = {
    refresh: refreshAll,
    init: initAll,
    instances: instances,
  };

  if (DEBUG && !document.querySelector('[data-mvi-mode="' + MVI_MODE + '"]')) {
    window.console.warn(
      "[Multi Variant Images] No data: no colour images saved or app embed off",
    );
  }
})();
