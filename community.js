// The Teacher Educator Exchange — community front end
// Loads as an ES module. Mount with:
//   <tex-comments item-type="story" item-slug="..." item-title="..."></tex-comments>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  SUPABASE_URL, SUPABASE_KEY, FREE_READ_COUNT,
  GUIDELINES_URL, DEFAULT_PROMPT, SPACES, THREAD_URL
} from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ------------------------------------------------------------------ state */

const state = {
  user: null,
  profile: null,
  ready: false,
  listeners: new Set()
};

function onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit() { state.listeners.forEach(fn => fn()); }

const profileComplete = p =>
  !!(p && p.photo_url && p.institution && p.role && p.interests && p.interests.length);

async function loadProfile(id) {
  const { data } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
  return data || null;
}

async function refresh() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user || null;
  state.profile = state.user ? await loadProfile(state.user.id) : null;
  state.ready = true;
  emit();
}

sb.auth.onAuthStateChange(() => { refresh(); });
refresh();

/* ------------------------------------------------------------- utilities */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.floor(h / 24); if (d === 1) return "yesterday";
  if (d < 30) return d + " days ago";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const AVATAR_FALLBACK =
  '<svg viewBox="0 0 40 40" width="100%" height="100%" style="display:block">' +
  '<circle cx="20" cy="20" r="20" fill="#dde4ee"></circle>' +
  '<circle cx="20" cy="15.5" r="6.2" fill="#a9b7cb"></circle>' +
  '<path d="M6 38c1.6-7.6 7.2-11.5 14-11.5S32.4 30.4 34 38z" fill="#a9b7cb"></path></svg>';

const avatar = p => p?.photo_url
  ? `<img src="${esc(p.photo_url)}" alt="">`
  : AVATAR_FALLBACK;

/* ------------------------------------------------------------------ modal */

let modalEl = null;

function closeModal() {
  modalEl?.remove();
  modalEl = null;
  document.removeEventListener("keydown", onModalKey);
}
function onModalKey(e) { if (e.key === "Escape") closeModal(); }

function openModal(render, { wide = false } = {}) {
  closeModal();
  const back = document.createElement("div");
  back.className = "tex-m-back";
  back.innerHTML = `<div class="tex-m-wrap"><div class="tex-m${wide ? " is-wide" : ""}">
    <button class="tex-m-x" type="button" aria-label="Close">&times;</button>
    <div class="tex-m-content"></div></div></div>`;
  back.addEventListener("mousedown", e => { if (e.target === back) closeModal(); });
  back.querySelector(".tex-m-x").addEventListener("click", closeModal);
  document.body.appendChild(back);
  document.addEventListener("keydown", onModalKey);
  modalEl = back;
  const slot = back.querySelector(".tex-m-content");
  render(slot, back);
  slot.querySelector("input, textarea, button")?.focus();
  return back;
}

const setMsg = (slot, cls, text) => {
  slot.querySelector(".tex-err, .tex-ok")?.remove();
  if (!text) return;
  const d = document.createElement("div");
  d.className = cls; d.textContent = text;
  slot.querySelector("form")?.appendChild(d) || slot.appendChild(d);
};

/* --------------------------------------------------------------- sign in */

function signInModal(afterAuth) {
  openModal(slot => {
    slot.innerHTML = `
      <div class="tex-m-head">
        <div class="tex-m-kicker">THE EXCHANGE</div>
        <h2 class="tex-m-t">Sign in</h2>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f"><label for="tex-e">Email</label>
          <input class="tex-in" id="tex-e" type="email" autocomplete="email" required></div>
        <div class="tex-f"><label for="tex-p">Password</label>
          <input class="tex-in" id="tex-p" type="password" autocomplete="current-password" required></div>
        <button class="texc-btn" type="submit" style="width:100%;margin-top:6px">Sign in</button>
        <div class="tex-m-alt"><button type="button" data-go="reset">Forgotten your password?</button></div>
        <div class="tex-m-alt">New here? <button type="button" data-go="join">Join the Community</button></div>
      </form></div>`;

    slot.querySelector('[data-go="join"]').onclick = () => joinModal(afterAuth);
    slot.querySelector('[data-go="reset"]').onclick = () => resetModal();

    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true; setMsg(slot, "tex-err", "");
      const { error } = await sb.auth.signInWithPassword({
        email: slot.querySelector("#tex-e").value.trim(),
        password: slot.querySelector("#tex-p").value
      });
      btn.disabled = false;
      if (error) return setMsg(slot, "tex-err",
        /confirm/i.test(error.message)
          ? "Confirm your email address first — check your inbox for the link."
          : "That email and password do not match an account.");
      await refresh();
      if (!profileComplete(state.profile)) return profileModal(afterAuth);
      closeModal(); afterAuth?.();
    });
  });
}

/* ------------------------------------------------------------------ join */

function joinModal(afterAuth) {
  openModal(slot => {
    slot.innerHTML = `
      <div class="tex-m-head">
        <div class="tex-m-kicker">THE EXCHANGE</div>
        <h2 class="tex-m-t">Join the Community</h2>
        <p class="tex-m-b">Free, and open to anyone who prepares, mentors, or supervises teachers.
          Members write under their own names.</p>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f"><label for="tex-n">Your name</label>
          <input class="tex-in" id="tex-n" autocomplete="name" required></div>
        <div class="tex-f">
          <label for="tex-e">Email <span class="tex-f-help">— your institutional address if you have one</span></label>
          <input class="tex-in" id="tex-e" type="email" autocomplete="email" required></div>
        <div class="tex-f"><label for="tex-p">Password <span class="tex-f-help">— at least 8 characters</span></label>
          <input class="tex-in" id="tex-p" type="password" autocomplete="new-password" required></div>
        <div class="tex-check">
          <input type="checkbox" id="tex-g" required>
          <label for="tex-g">I will post under my own name, keep the people and places in my
            accounts unidentifiable, and follow the
            <a href="${GUIDELINES_URL}" target="_blank" rel="noopener">community guidelines</a>.</label>
        </div>
        <button class="texc-btn" type="submit" style="width:100%;margin-top:14px">Create my account</button>
        <div class="tex-m-alt">Already a member? <button type="button" data-go="in">Sign in</button></div>
      </form></div>`;

    slot.querySelector('[data-go="in"]').onclick = () => signInModal(afterAuth);

    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const name = slot.querySelector("#tex-n").value.trim();
      const email = slot.querySelector("#tex-e").value.trim();
      const pw = slot.querySelector("#tex-p").value;
      if (!name) return setMsg(slot, "tex-err", "Please give the name you will post under.");
      if (!/.+@.+\..+/.test(email)) return setMsg(slot, "tex-err", "That email address does not look right.");
      if (pw.length < 8) return setMsg(slot, "tex-err", "Passwords need at least 8 characters.");
      if (!slot.querySelector("#tex-g").checked)
        return setMsg(slot, "tex-err", "Please agree to the community guidelines.");

      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true; setMsg(slot, "tex-err", "");
      const { error } = await sb.auth.signUp({
        email, password: pw,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.href
        }
      });
      btn.disabled = false;
      if (error) return setMsg(slot, "tex-err",
        /already/i.test(error.message)
          ? "There is already an account with that email. Try signing in."
          : error.message);

      slot.innerHTML = `
        <div class="tex-m-head">
          <div class="tex-m-kicker">ONE MORE STEP</div>
          <h2 class="tex-m-t">Check your inbox</h2>
          <p class="tex-m-b">We have sent a confirmation link to <strong>${esc(email)}</strong>.
            Click it and you will come straight back here to finish your profile.</p>
        </div>
        <div class="tex-m-body">
          <p style="font-size:14px;line-height:1.55;color:#5b6879;margin:0 0 16px">
            Nothing in your inbox after a minute or two? Check the spam folder — university mail
            filters are enthusiastic.</p>
          <button class="texc-btn-2" type="button" style="width:100%">Close</button>
        </div>`;
      slot.querySelector("button").onclick = closeModal;
    });
  });
}

/* ----------------------------------------------------------------- reset */

function resetModal() {
  openModal(slot => {
    slot.innerHTML = `
      <div class="tex-m-head">
        <h2 class="tex-m-t">Reset your password</h2>
        <p class="tex-m-b">We will email you a link to set a new one.</p>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f"><label for="tex-e">Email</label>
          <input class="tex-in" id="tex-e" type="email" autocomplete="email" required></div>
        <button class="texc-btn" type="submit" style="width:100%;margin-top:6px">Send the link</button>
      </form></div>`;
    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true;
      await sb.auth.resetPasswordForEmail(slot.querySelector("#tex-e").value.trim(),
        { redirectTo: window.location.href });
      setMsg(slot, "tex-ok", "If that address has an account, the link is on its way.");
    });
  });
}

/* --------------------------------------------------------------- profile */

const LOOKING_FOR = [
  "Collaborators for a project",
  "Co-authors",
  "A mentor",
  "Someone to mentor",
  "Tools I can adapt",
  "People working on the same problem"
];

/* --------------------------------------------------------------- cropper */
/* A square drag-and-zoom cropper: members place their own face in the frame
   and we upload the cropped square, so no avatar is centre-cropped through
   the top of someone's head. */
function mountCropper(box) {
  const S = 220, OUT = 480;
  box.innerHTML = `
    <canvas class="tex-crop-c" width="${S}" height="${S}"></canvas>
    <div class="tex-crop-side">
      <p class="tex-crop-hint">Drag the photograph to place your face in the frame, and zoom to fit.</p>
      <label class="tex-crop-zl">Zoom
        <input class="tex-crop-z" type="range" min="1" max="3" step="0.01" value="1">
      </label>
    </div>`;
  const cv = box.querySelector("canvas"), ctx = cv.getContext("2d");
  const zoom = box.querySelector(".tex-crop-z");
  let img = null, z = 1, ox = 0, oy = 0;

  const dims = () => {
    const eff = (S / Math.min(img.naturalWidth, img.naturalHeight)) * z;
    return [img.naturalWidth * eff, img.naturalHeight * eff];
  };
  const draw = () => {
    ctx.clearRect(0, 0, S, S);
    if (!img) return;
    const [dw, dh] = dims();
    ox = Math.min(0, Math.max(S - dw, ox));
    oy = Math.min(0, Math.max(S - dh, oy));
    ctx.drawImage(img, ox, oy, dw, dh);
  };

  let drag = null;
  const down = e => {
    if (!img) return;
    const t = e.touches ? e.touches[0] : e;
    drag = { x: t.clientX, y: t.clientY, ox, oy };
    e.preventDefault();
  };
  const move = e => {
    if (!drag) return;
    const t = e.touches ? e.touches[0] : e;
    ox = drag.ox + (t.clientX - drag.x);
    oy = drag.oy + (t.clientY - drag.y);
    draw(); e.preventDefault();
  };
  const up = () => { drag = null; };
  cv.addEventListener("mousedown", down);
  cv.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("mousemove", move);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);

  zoom.addEventListener("input", () => {
    if (!img) return;
    const k = +zoom.value / z; z = +zoom.value;
    ox = S / 2 - (S / 2 - ox) * k;
    oy = S / 2 - (S / 2 - oy) * k;
    draw();
  });

  return {
    ready: () => !!img,
    load(src) {
      return new Promise((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => {
          img = i; z = 1; zoom.value = "1";
          const [dw, dh] = dims();
          ox = (S - dw) / 2; oy = (S - dh) / 2;
          box.hidden = false; draw(); res();
        };
        i.onerror = rej;
        i.src = src;
      });
    },
    blob() {
      if (!img) return null;
      const out = document.createElement("canvas");
      out.width = out.height = OUT;
      const k = OUT / S, [dw, dh] = dims();
      out.getContext("2d").drawImage(img, ox * k, oy * k, dw * k, dh * k);
      return new Promise(res => out.toBlob(res, "image/jpeg", 0.9));
    }
  };
}

function profileModal(afterSave) {
  openModal(slot => {
    const p = state.profile || {};
    const want = p.looking_for || [];
    slot.innerHTML = `
      <div class="tex-m-head">
        <div class="tex-m-kicker">${profileComplete(p) ? "YOUR PROFILE" : "ONE STEP LEFT"}</div>
        <h2 class="tex-m-t">${profileComplete(p) ? "Edit your profile" : "Finish your profile"}</h2>
        <p class="tex-m-b">Colleagues respond differently when they know who is speaking.
          The first four are needed before your first comment; the rest are how people find you.</p>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f"><label for="tex-ph">Photograph${p.photo_url
          ? ` <span class="tex-f-help">— leave empty to keep the current one</span>` : ""}</label>
          <input class="tex-in" id="tex-ph" type="file" accept="image/*">
          ${p.photo_url ? `<button class="tex-crop-adj" type="button">Reposition the photograph you have</button>` : ""}
          <div class="tex-crop" hidden></div></div>
        <div class="tex-f"><label for="tex-i">Institution or organization</label>
          <input class="tex-in" id="tex-i" value="${esc(p.institution || "")}"
            placeholder="Old Dominion University" required></div>
        <div class="tex-f"><label for="tex-r">Role</label>
          <input class="tex-in" id="tex-r" value="${esc(p.role || "")}"
            placeholder="Professor of Teacher Education" required></div>
        <div class="tex-f">
          <label for="tex-int">Areas of interest <span class="tex-f-help">— separated by commas</span></label>
          <input class="tex-in" id="tex-int" value="${esc((p.interests || []).join(", "))}"
            placeholder="Self-study, clinical practice, doctoral preparation" required></div>

        <div class="tex-m-div">Optional</div>

        <div class="tex-f">
          <label for="tex-about">Your teaching and research
            <span class="tex-f-help">— a short paragraph</span></label>
          <textarea class="tex-in" id="tex-about" rows="4"
            placeholder="The courses you teach, what you are researching, and what you are working on right now.">${esc(p.about || "")}</textarea></div>

        <div class="tex-f">
          <label for="tex-links">Links <span class="tex-f-help">— one per line</span></label>
          <textarea class="tex-in" id="tex-links" rows="3"
            placeholder="https://scholar.google.com/...&#10;https://orcid.org/...">${esc((p.links || []).join("\n"))}</textarea></div>

        <div class="tex-f">
          <label>What you are hoping to find here</label>
          <div class="tex-chips">${LOOKING_FOR.map((o, i) => `
            <label class="tex-chip">
              <input type="checkbox" data-lf="${esc(o)}" ${want.includes(o) ? "checked" : ""}>
              <span>${esc(o)}</span>
            </label>`).join("")}</div></div>

        <div class="tex-f">
          <label>Being reachable</label>
          <label class="tex-chip tex-chip-wide">
            <input type="checkbox" id="tex-contact" ${p.contact_ok ? "checked" : ""}>
            <span>Let members write to me — shows a <em>Write to</em> link on my directory entry,
              which opens their mail program addressed to me. Your address is never shown on the
              page, and never to anyone who is not signed in.</span>
          </label></div>

        <button class="texc-btn" type="submit" style="width:100%;margin-top:14px">Save</button>
      </form></div>`;

    const cropper = mountCropper(slot.querySelector(".tex-crop"));
    slot.querySelector("#tex-ph").addEventListener("change", e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 15 * 1024 * 1024)
        return setMsg(slot, "tex-err", "That image is very large — please use one under 15 MB.");
      const url = URL.createObjectURL(f);
      cropper.load(url)
        .catch(() => setMsg(slot, "tex-err", "That file would not open as an image."));
    });
    slot.querySelector(".tex-crop-adj")?.addEventListener("click", ev => {
      ev.target.disabled = true;
      cropper.load(p.photo_url).catch(() => {
        ev.target.disabled = false;
        setMsg(slot, "tex-err", "That photograph could not be loaded for repositioning — please upload it again.");
      });
    });

    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const inst = slot.querySelector("#tex-i").value.trim();
      const role = slot.querySelector("#tex-r").value.trim();
      const ints = slot.querySelector("#tex-int").value.split(",").map(s => s.trim()).filter(Boolean);
      const about = slot.querySelector("#tex-about").value.trim();
      const links = slot.querySelector("#tex-links").value.split(/\n+/)
        .map(s => s.trim()).filter(Boolean)
        .map(s => /^https?:\/\//i.test(s) ? s : "https://" + s);
      const lf = [...slot.querySelectorAll("[data-lf]:checked")].map(el => el.dataset.lf);
      const contactOk = slot.querySelector("#tex-contact").checked;
      const cropped = cropper.ready() ? await cropper.blob() : null;

      if (!inst || !role || !ints.length)
        return setMsg(slot, "tex-err", "Institution, role, and at least one area of interest, please.");
      if (!cropped && !p.photo_url)
        return setMsg(slot, "tex-err", "A photograph, please — this is a room of colleagues.");

      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…"; setMsg(slot, "tex-err", "");

      let photo = p.photo_url || null;
      if (cropped) {
        const path = `${state.user.id}/avatar.jpg`;
        const { error: upErr } = await sb.storage.from("avatars")
          .upload(path, cropped, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
        if (upErr) {
          btn.disabled = false; btn.textContent = "Save";
          return setMsg(slot, "tex-err",
            "The photograph would not upload — " + (upErr.message || "unknown error") + ".");
        }
        photo = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl
          + "?v=" + Date.now();
      }

      const { error } = await sb.from("profiles")
        .update({
          institution: inst, role, interests: ints, photo_url: photo,
          about: about || null, links, looking_for: lf,
          contact_ok: contactOk,
          contact_email: contactOk ? (state.user.email || null) : null
        })
        .eq("id", state.user.id);
      btn.disabled = false; btn.textContent = "Save";
      if (error) return setMsg(slot, "tex-err", error.message);

      await refresh();
      closeModal();
      afterSave?.();
    });
  }, { wide: true });
}

/* ---------------------------------------------------------------- report */

function reportModal(commentId) {
  openModal(slot => {
    slot.innerHTML = `
      <div class="tex-m-head">
        <h2 class="tex-m-t">Report this comment</h2>
        <p class="tex-m-b">This goes to the editorial team. Tell us briefly what the problem is.</p>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f">
          <label for="tex-why">What is wrong with it?</label>
          <textarea class="tex-in" id="tex-why" rows="3"
            placeholder="Identifies a candidate by name, for example"></textarea></div>
        <button class="texc-btn texc-btn-warn" type="submit" style="width:100%">Send the report</button>
      </form></div>`;
    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true;
      const { error } = await sb.from("reports").insert({
        comment_id: commentId,
        reporter_id: state.user.id,
        reason: slot.querySelector("#tex-why").value.trim() || null
      });
      if (error && error.code !== "23505") {
        btn.disabled = false;
        return setMsg(slot, "tex-err", "That report would not send. Try again in a moment.");
      }
      slot.innerHTML = `
        <div class="tex-m-head"><h2 class="tex-m-t">Thank you</h2>
          <p class="tex-m-b">The editorial team will look at it. You will not hear back unless
            we need to ask you something.</p></div>
        <div class="tex-m-body"><button class="texc-btn-2" type="button" style="width:100%">Close</button></div>`;
      slot.querySelector("button").onclick = closeModal;
    });
  });
}

/* ------------------------------------------------------- <tex-comments> */

class TexComments extends HTMLElement {
  connectedCallback() {
    this.className = "tex-c";
    this.itemType = this.getAttribute("item-type") || "story";
    this.itemSlug = this.getAttribute("item-slug") || location.pathname.split("/").filter(Boolean).pop() || "";
    this.itemTitle = this.getAttribute("item-title")
      || document.querySelector("h1")?.textContent.trim()
      || document.title;
    this.prompt = (this.getAttribute("prompt")
      || document.querySelector("[data-tex-prompt]")?.textContent || "").trim() || DEFAULT_PROMPT;
    this.comments = [];
    this.replyTo = null;
    this.unsub = onChange(() => this.render());
    this.load();
  }
  disconnectedCallback() { this.unsub?.(); }

  async load() {
    const { data } = await sb.from("comments")
      .select("*, profiles(full_name, photo_url, role, institution)")
      .eq("item_type", this.itemType)
      .eq("item_slug", this.itemSlug)
      .order("created_at", { ascending: true });
    this.comments = data || [];
    this.render();
  }

  /* ordered so replies follow their parent */
  ordered() {
    const tops = this.comments.filter(c => !c.parent_id);
    const out = [];
    tops.forEach(t => {
      out.push(t);
      this.comments.filter(c => c.parent_id === t.id).forEach(r => out.push(r));
    });
    return out;
  }

  render() {
    const signedIn = !!state.user;
    const complete = profileComplete(state.profile);
    const list = this.ordered();
    const visible = signedIn ? list : list.slice(0, FREE_READ_COUNT);
    const hidden = list.length - visible.length;
    const n = list.length;

    const countLabel = n === 0 ? "No comments yet" : n === 1 ? "1 comment" : `${n} comments`;

    let html = `
      <div class="tex-c-head">
        <div>
          <div class="tex-c-kicker">COMMUNITY CONVERSATION</div>
          <h2 class="tex-c-prompt">${esc(n === 0 ? "Be the first to respond" : this.prompt)}</h2>
        </div>
        <div class="tex-c-count">${countLabel}</div>
      </div>`;

    if (n > 0) {
      html += `<div class="tex-c-list">` + visible.map(c => this.itemHTML(c)).join("") + `</div>`;
    }

    if (!signedIn && hidden > 0) {
      html += `
        <div class="tex-c-tease"><div class="tex-c-tease-in">
          <div class="tex-c-skel-row"><div class="tex-c-skel-av"></div>
            <div><div class="tex-c-skel-l"></div>
              <div class="tex-c-skel-p" style="width:100%"></div>
              <div class="tex-c-skel-p" style="width:86%"></div></div></div>
          <div class="tex-c-tease-fade"></div></div></div>
        <div class="tex-c-wall">
          <div class="tex-c-wall-t">${hidden === 1
            ? "One more colleague has responded"
            : `${hidden} more colleagues have responded`}</div>
          <div class="tex-c-wall-b">Members are teacher educators writing under their own names.
            Joining is free.</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button class="texc-btn" type="button" data-a="join">Join the Community</button>
            <button class="texc-btn-2" type="button" data-a="in">Sign in</button>
          </div>
        </div>`;
    }

    if (n === 0) {
      html += `
        <div class="tex-c-empty">
          <div class="tex-c-empty-ic">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1355c7"
              stroke-width="1.5" stroke-linecap="round">
              <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"></path></svg>
          </div>
          <div class="tex-c-empty-t">No one has responded yet</div>
          <div class="tex-c-empty-b">If you have tried something like this, say what happened —
            including the part that did not work. A first comment is what makes the second one
            possible.</div>
        </div>`;
    }

    if (!signedIn && n === 0) {
      html += `<div class="tex-c-composer" style="text-align:center">
        <button class="texc-btn" type="button" data-a="join">Join the Community</button>
        <button class="texc-btn-2" type="button" data-a="in" style="margin-left:8px">Sign in</button>
      </div>`;
    } else if (signedIn) {
      const who = state.profile?.full_name || "you";
      const where = state.profile?.institution ? ` · ${esc(state.profile.institution)}` : "";
      html += `
        <div class="tex-c-composer">
          <div class="tex-c-row">
            <div class="tex-c-av">${avatar(state.profile)}</div>
            <div>
              <div class="tex-c-hint">${this.replyTo
                ? `Replying to ${esc(this.replyTo.name)} · <button class="tex-c-act is-quiet" type="button" data-a="cancel">cancel</button>`
                : "Add your perspective"}</div>
              <textarea class="tex-c-ta" data-el="ta"
                placeholder="What did you try, what happened, and what would you do differently?"></textarea>
              <div class="tex-c-foot">
                <div>
                  <div class="tex-c-as">Posting as <strong>${esc(who)}</strong>${where}</div>
                  <div class="tex-c-rule">Real names. No identifying details about people or places.</div>
                </div>
                <button class="texc-btn" type="button" data-a="post">
                  ${this.replyTo ? "Post reply" : "Post comment"}</button>
              </div>
            </div>
          </div>
          ${complete ? "" : `<div class="tex-ok" style="margin-left:58px">
            Your profile needs four more fields before your first comment.
            <button class="tex-c-act" type="button" data-a="profile"
              style="margin-left:4px">Finish it now</button></div>`}
        </div>`;
    }

    this.innerHTML = html;
    this.wire();
  }

  itemHTML(c) {
    const p = c.profiles || {};
    const mine = state.user && c.author_id === state.user.id;
    return `
      <div class="tex-c-item${c.parent_id ? " is-reply" : ""}">
        <div class="tex-c-row">
          <div class="tex-c-av">${avatar(p)}</div>
          <div>
            <div class="tex-c-byline">
              <span class="tex-c-name">${esc(p.full_name || "Member")}</span>
              <span class="tex-c-role">${esc([p.role, p.institution].filter(Boolean).join(", "))}</span>
              <span class="tex-c-when">${esc(ago(c.created_at))}</span>
            </div>
            <div class="tex-c-body">${esc(c.body)}</div>
            <div class="tex-c-acts">
              ${c.parent_id ? "" : `<button class="tex-c-act" type="button"
                 data-a="reply" data-id="${c.id}" data-name="${esc(p.full_name || "Member")}">Reply</button>`}
              ${mine ? `<button class="tex-c-act is-quiet" type="button"
                 data-a="delete" data-id="${c.id}">Delete</button>`
                     : `<button class="tex-c-act is-quiet" type="button"
                 data-a="report" data-id="${c.id}">Report</button>`}
            </div>
          </div>
        </div>
      </div>`;
  }

  wire() {
    const after = () => this.load();
    this.querySelectorAll("[data-a]").forEach(el => {
      const a = el.dataset.a;
      el.onclick = async () => {
        if (a === "join")    return joinModal(after);
        if (a === "in")      return signInModal(after);
        if (a === "profile") return profileModal(after);
        if (a === "cancel")  { this.replyTo = null; return this.render(); }
        if (a === "reply") {
          if (!state.user) return signInModal(after);
          this.replyTo = { id: Number(el.dataset.id), name: el.dataset.name };
          this.render();
          this.querySelector('[data-el="ta"]')?.focus();
          return;
        }
        if (a === "report") {
          if (!state.user) return signInModal(after);
          return reportModal(Number(el.dataset.id));
        }
        if (a === "delete") {
          if (!confirm("Delete your comment? This cannot be undone.")) return;
          await sb.from("comments").delete().eq("id", Number(el.dataset.id));
          return this.load();
        }
        if (a === "post") return this.post(el);
      };
    });
  }

  async post(btn) {
    const ta = this.querySelector('[data-el="ta"]');
    const body = ta.value.trim();
    if (body.length < 2) { ta.focus(); return; }
    if (!profileComplete(state.profile)) return profileModal(() => this.post(btn));

    btn.disabled = true; btn.textContent = "Posting…";
    const { error } = await sb.from("comments").insert({
      author_id: state.user.id,
      item_type: this.itemType,
      item_slug: this.itemSlug,
      item_title: this.itemTitle,
      item_url: location.pathname,
      parent_id: this.replyTo?.id || null,
      body
    });
    btn.disabled = false;

    if (error) {
      btn.textContent = "Try again";
      console.error("[tex] post failed", error);
      return;
    }
    ta.value = "";
    this.replyTo = null;
    await this.load();
  }
}

customElements.define("tex-comments", TexComments);

/* --------------------------------------------------------- <tex-members> */

class TexMembers extends HTMLElement {
  connectedCallback() {
    this.className = "tex-dir";
    this.q = "";
    this.members = [];
    this.loaded = false;
    this.unsub = onChange(() => this.render());
    this.load();
  }
  disconnectedCallback() { this.unsub?.(); }

  async load() {
    const { data } = await sb.from("profiles")
      .select("id, full_name, photo_url, institution, role, interests, about, links, looking_for, contact_ok, contact_email")
      .not("institution", "is", null)
      .order("full_name", { ascending: true });
    this.members = data || [];
    this.loaded = true;
    this.render();
  }

  matches(m) {
    const q = this.q.trim().toLowerCase();
    if (!q) return true;
    return [m.full_name, m.institution, m.role, m.about,
            ...(m.interests || []), ...(m.looking_for || [])]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  }

  render() {
    if (!state.user) {
      this.innerHTML = `
        <div class="tex-dir-gate">
          <div class="tex-dir-gate-t">The directory is for members</div>
          <div class="tex-dir-gate-b">Members can see who else is here, what they work on, and
            where they sit — so collaborations can start. Joining is free.</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button class="texc-btn" type="button" data-a="join">Join the Community</button>
            <button class="texc-btn-2" type="button" data-a="in">Sign in</button>
          </div>
        </div>`;
      this.wire();
      return;
    }

    const list = this.members.filter(m => this.matches(m));

    this.innerHTML = `
      <div class="tex-dir-bar">
        <input class="tex-dir-search" type="search" value="${esc(this.q)}"
          placeholder="Search by name, institution, role, interest, or what someone is looking for">
        <div class="tex-dir-count">${list.length === this.members.length
          ? `${this.members.length} member${this.members.length === 1 ? "" : "s"}`
          : `${list.length} of ${this.members.length}`}</div>
        <button class="texc-btn-2 texc-btn-sm" type="button" data-a="edit">Edit my profile</button>
      </div>
      ${!this.loaded ? `<div class="tex-dir-note">Loading…</div>` : ""}
      ${this.loaded && list.length === 0 ? `<div class="tex-dir-note">
        ${this.q ? "No one matches that search yet." : "No members with completed profiles yet."}
      </div>` : ""}
      <div class="tex-dir-grid">${list.map(m => this.cardHTML(m)).join("")}</div>`;

    const input = this.querySelector(".tex-dir-search");
    if (input) {
      input.oninput = e => {
        this.q = e.target.value;
        const pos = e.target.selectionStart;
        this.render();
        const next = this.querySelector(".tex-dir-search");
        next.focus();
        next.setSelectionRange(pos, pos);
      };
    }
    this.wire();
  }

  cardHTML(m) {
    const mine = state.user && m.id === state.user.id;
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
    return `
      <div class="tex-dir-card">
        <div class="tex-dir-top">
          <div class="tex-dir-av">${avatar(m)}</div>
          <div>
            <div class="tex-dir-name">${esc(m.full_name)}${mine
              ? ` <span class="tex-dir-you">you</span>` : ""}</div>
            <div class="tex-dir-role">${esc(m.role || "")}</div>
            <div class="tex-dir-inst">${esc(m.institution || "")}</div>
          </div>
        </div>
        ${m.about ? `<p class="tex-dir-about">${esc(m.about)}</p>` : ""}
        ${(m.interests || []).length ? `<div class="tex-dir-tags">${
          m.interests.map(i => `<span class="tex-dir-tag">${esc(i)}</span>`).join("")
        }</div>` : ""}
        ${(m.looking_for || []).length ? `<div class="tex-dir-want">
          <div class="tex-dir-want-k">LOOKING FOR</div>
          <div class="tex-dir-want-v">${esc(m.looking_for.join(" \u00b7 "))}</div>
        </div>` : ""}
        ${(m.links || []).length ? `<div class="tex-dir-links">${
          m.links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join("")
        }</div>` : ""}
        ${!mine && state.user && m.contact_ok && m.contact_email ? `<a class="tex-dir-write"
          href="mailto:${esc(m.contact_email)}?subject=${encodeURIComponent(
            "From the Teacher Educator Exchange")}">Write to ${esc(m.full_name.split(" ")[0])}</a>` : ""}
      </div>`;
  }

  wire() {
    this.querySelectorAll("[data-a]").forEach(el => {
      el.onclick = () => {
        if (el.dataset.a === "join") joinModal(() => this.load());
        if (el.dataset.a === "in")   signInModal(() => this.load());
        if (el.dataset.a === "edit") profileModal(() => this.load());
      };
    });
  }
}

customElements.define("tex-members", TexMembers);

/* --------------------------------------------------- site-wide helpers */
// Any element with data-tex="join" / "signin" / "signout" / "account" works anywhere
// on the site — nav buttons, the community page, the footer.

function wireGlobal() {
  document.querySelectorAll("[data-tex]").forEach(el => {
    if (el.__texWired) return;
    el.__texWired = true;
    el.addEventListener("click", e => {
      e.preventDefault();
      const a = el.dataset.tex;
      if (a === "join")    joinModal();
      if (a === "signin")  signInModal();
      if (a === "account") profileModal();
      if (a === "signout") sb.auth.signOut();
    });
  });
}

function paintGlobal() {
  const inEls  = document.querySelectorAll('[data-tex-when="in"]');
  const outEls = document.querySelectorAll('[data-tex-when="out"]');
  inEls.forEach(el => el.style.display = state.user ? "" : "none");
  outEls.forEach(el => el.style.display = state.user ? "none" : "");
  document.querySelectorAll("[data-tex-name]").forEach(el => {
    el.textContent = state.profile?.full_name || "";
  });
}

onChange(paintGlobal);
document.addEventListener("DOMContentLoaded", () => { wireGlobal(); paintGlobal(); });
wireGlobal();

/* ?join=1 (or #join) opens the signup modal — the link to put in emails and invitations.
   Does nothing for a signed-in member with a complete profile, which is correct. */
(function autoOpen() {
  const wants = /[?&]join=1/.test(location.search) || location.hash === "#join";
  if (!wants) return;
  const go = () => {
    if (!state.user) joinModal();
    else if (!profileComplete(state.profile)) profileModal();
  };
  if (state.ready) return go();
  const off = onChange(() => {
    if (!state.ready) return;
    off();
    go();
  });
})();

export { sb, state, joinModal, signInModal, profileModal, onChange };

/* ----------------------------------------------------------------- spaces */
// <tex-spaces> — the /community page. Space cards swap in place for that
// space's thread list; an individual conversation gets its own address.

const spaceBySlug = s => SPACES.find(x => x.slug === s) || null;
const threadHref = id => THREAD_URL + "?id=" + id;

const PIECE_PATH = { story: "/story/", toolkit: "/toolkits/", shelf: "/shelf/" };

function threadModal(space, afterPost) {
  openModal(slot => {
    slot.innerHTML = `
      <div class="tex-m-head">
        <div class="tex-m-kicker">${esc(space.name.toUpperCase())}</div>
        <h2 class="tex-m-t">Start a conversation</h2>
        <p class="tex-m-b">Write the way you would to a colleague who knows the work:
          what you are sitting with, what you have tried, and what you want from the room.</p>
      </div>
      <div class="tex-m-body"><form novalidate>
        <div class="tex-f"><label for="tex-tt">Title</label>
          <input class="tex-in" id="tex-tt" maxlength="160"
            placeholder="How do you handle a mentor teacher who will not let a candidate teach?" required></div>
        <div class="tex-f"><label for="tex-tb">What you want to ask or say</label>
          <textarea class="tex-in" id="tex-tb" rows="8"
            placeholder="Give enough context that someone can answer usefully — and no identifying details about people, candidates, or schools."></textarea></div>
        <button class="texc-btn" type="submit" style="width:100%;margin-top:10px">Post the conversation</button>
      </form></div>`;

    slot.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const title = slot.querySelector("#tex-tt").value.trim();
      const body = slot.querySelector("#tex-tb").value.trim();
      if (title.length < 4) return setMsg(slot, "tex-err", "A title, please — it is how people decide to read.");
      if (body.length < 2) return setMsg(slot, "tex-err", "Say a little more about what you are asking.");

      const btn = slot.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Posting…"; setMsg(slot, "tex-err", "");

      const { data, error } = await sb.from("threads")
        .insert({ space: space.slug, author_id: state.user.id, title, body })
        .select("id").single();

      btn.disabled = false; btn.textContent = "Post the conversation";
      if (error) return setMsg(slot, "tex-err", error.message);
      closeModal();
      afterPost?.(data.id);
    });
  }, { wide: true });
}

class TexSpaces extends HTMLElement {
  connectedCallback() {
    this.className = "tex-sp";
    this.threads = [];
    this.counts = {};
    this.latest = [];
    this.space = (location.hash || "").replace(/^#/, "") || null;
    // both, deliberately: hashchange covers card clicks, popstate covers the
    // browser's back button after the "All spaces" link clears the hash
    this.onHash = () => { this.space = (location.hash || "").replace(/^#/, "") || null; this.render(); };
    window.addEventListener("hashchange", this.onHash);
    window.addEventListener("popstate", this.onHash);
    this.unsub = onChange(() => this.load());
    this.load();
  }
  disconnectedCallback() {
    this.unsub?.();
    window.removeEventListener("hashchange", this.onHash);
    window.removeEventListener("popstate", this.onHash);
  }

  async load() {
    if (state.user) {
      const [{ data: th }, { data: reps }] = await Promise.all([
        sb.from("threads")
          .select("id, space, title, body, created_at, is_pinned, profiles(full_name, photo_url, role, institution)")
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false }),
        sb.from("comments").select("item_slug, created_at").eq("item_type", "thread")
      ]);
      this.threads = th || [];
      this.counts = {};
      (reps || []).forEach(r => {
        const k = r.item_slug;
        const c = this.counts[k] || { n: 0, last: null };
        c.n += 1;
        if (!c.last || r.created_at > c.last) c.last = r.created_at;
        this.counts[k] = c;
      });
    }
    const { data: lat } = await sb.from("comments")
      .select("id, item_type, item_slug, item_title, item_url, body, created_at, profiles(full_name)")
      .in("item_type", ["story", "toolkit", "shelf"])
      .order("created_at", { ascending: false })
      .limit(3);
    this.latest = lat || [];
    this.render();
  }

  activity(t) {
    const c = this.counts[String(t.id)];
    return (c?.last && c.last > t.created_at) ? c.last : t.created_at;
  }

  render() {
    if (!state.ready) { this.innerHTML = ""; return; }

    let html = this.latestHTML();

    if (!state.user) {
      html += `
        <div class="tex-c-wall" style="margin-top:22px">
          <div class="tex-c-wall-t">The conversations are for members</div>
          <div class="tex-c-wall-b">Members are teacher educators writing under their own names.
            Joining is free, and takes a minute.</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button class="texc-btn" type="button" data-a="join">Join the Community</button>
            <button class="texc-btn-2" type="button" data-a="in">Sign in</button>
          </div>
        </div>`;
      this.innerHTML = html;
      return this.wire();
    }

    const space = spaceBySlug(this.space);
    html += space ? this.threadListHTML(space) : this.cardsHTML();
    this.innerHTML = html;
    this.wire();
  }

  latestHTML() {
    if (!this.latest.length) return "";
    return `
      <div class="tex-sp-latest">
        <div class="tex-sp-latest-h">LATEST ACROSS THE EXCHANGE</div>
        <div class="tex-sp-latest-g">${this.latest.map(c => `
          <a class="tex-sp-latest-i" href="${esc(c.item_url || (PIECE_PATH[c.item_type] || "/") + c.item_slug)}">
            <div class="tex-sp-latest-on">${esc(c.item_title)}</div>
            <div class="tex-sp-latest-b">${esc(c.body.length > 140 ? c.body.slice(0, 140) + "…" : c.body)}</div>
            <div class="tex-sp-latest-m">${esc(c.profiles?.full_name || "Member")} · ${esc(ago(c.created_at))}</div>
          </a>`).join("")}</div>
      </div>`;
  }

  cardsHTML() {
    return `
      <div class="tex-sp-grid">${SPACES.map(s => {
        const mine = this.threads.filter(t => t.space === s.slug);
        const newest = mine[0];
        const n = mine.length;
        return `
          <a class="tex-sp-card" href="#${esc(s.slug)}">
            <div class="tex-sp-card-n">${esc(s.name)}</div>
            <div class="tex-sp-card-b">${esc(s.blurb)}</div>
            <div class="tex-sp-card-f">
              <span class="tex-sp-card-c">${n === 0 ? "No conversations yet"
                : n === 1 ? "1 conversation" : n + " conversations"}</span>
              ${newest ? `<span class="tex-sp-card-l">${esc(newest.title.length > 60
                ? newest.title.slice(0, 60) + "…" : newest.title)}</span>` : ""}
            </div>
          </a>`;
      }).join("")}</div>`;
  }

  threadListHTML(space) {
    const list = this.threads.filter(t => t.space === space.slug)
      .sort((a, b) => (b.is_pinned - a.is_pinned) || (this.activity(b) > this.activity(a) ? 1 : -1));
    return `
      <div class="tex-sp-bar">
        <a class="tex-sp-back" href="#" data-a="all">← All spaces</a>
        <button class="texc-btn" type="button" data-a="new">Start a conversation</button>
      </div>
      <div class="tex-sp-head">
        <h2 class="tex-sp-h">${esc(space.name)}</h2>
        <p class="tex-sp-p">${esc(space.blurb)}</p>
      </div>
      ${list.length ? `<div class="tex-sp-threads">${list.map(t => {
        const c = this.counts[String(t.id)] || { n: 0 };
        const p = t.profiles || {};
        return `
          <a class="tex-sp-thread" href="${esc(threadHref(t.id))}">
            <div class="tex-sp-thread-av">${avatar(p)}</div>
            <div class="tex-sp-thread-m">
              <div class="tex-sp-thread-t">${t.is_pinned
                ? '<span class="tex-sp-pin">STANDING</span>' : ""}${esc(t.title)}</div>
              <div class="tex-sp-thread-b">${esc(t.body.length > 160 ? t.body.slice(0, 160) + "…" : t.body)}</div>
              <div class="tex-sp-thread-by">${esc(p.full_name || "Member")}${p.institution
                ? " · " + esc(p.institution) : ""} · ${esc(ago(this.activity(t)))}</div>
            </div>
            <div class="tex-sp-thread-n">${c.n}<span>${c.n === 1 ? "reply" : "replies"}</span></div>
          </a>`;
      }).join("")}</div>`
      : `<div class="tex-c-empty">
          <div class="tex-c-empty-t">Nothing here yet</div>
          <div class="tex-c-empty-b">Someone has to go first. A question you are genuinely
            stuck on is worth more to this room than a finished answer.</div>
          <div style="margin-top:16px"><button class="texc-btn" type="button" data-a="new">Start a conversation</button></div>
        </div>`}`;
  }

  wire() {
    this.querySelectorAll("[data-a]").forEach(el => {
      el.onclick = e => {
        const a = el.dataset.a;
        if (a === "all") {
          // href="#" alone does not reliably fire hashchange, so do it by hand
          e.preventDefault();
          history.pushState(null, "", location.pathname + location.search);
          this.space = null;
          return this.render();
        }
        if (a === "join") return joinModal(() => this.load());
        if (a === "in")   return signInModal(() => this.load());
        if (a === "new") {
          const space = spaceBySlug(this.space);
          if (!space) return;
          if (!profileComplete(state.profile))
            return profileModal(() => threadModal(space, id => { location.href = threadHref(id); }));
          return threadModal(space, id => { location.href = threadHref(id); });
        }
      };
    });
  }
}

customElements.define("tex-spaces", TexSpaces);

/* ----------------------------------------------------------------- thread */
// <tex-thread> — one conversation, at /thread?id=N. Replies are ordinary
// comments, so the whole comment component is reused verbatim.

class TexThread extends HTMLElement {
  connectedCallback() {
    this.className = "tex-th";
    this.id_ = Number(new URLSearchParams(location.search).get("id")) || null;
    this.thread = null;
    this.unsub = onChange(() => this.load());
    this.load();
  }
  disconnectedCallback() { this.unsub?.(); }

  async load() {
    if (!state.ready) return;
    if (!this.id_) { this.thread = null; return this.render(); }
    const { data } = await sb.from("threads")
      .select("*, profiles(full_name, photo_url, role, institution)")
      .eq("id", this.id_).maybeSingle();
    this.thread = data || null;
    this.render();
  }

  render() {
    if (!state.ready) { this.innerHTML = ""; return; }

    if (!state.user) {
      this.innerHTML = `
        <div class="tex-c-wall">
          <div class="tex-c-wall-t">This conversation is for members</div>
          <div class="tex-c-wall-b">Members are teacher educators writing under their own names.
            Joining is free.</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button class="texc-btn" type="button" data-a="join">Join the Community</button>
            <button class="texc-btn-2" type="button" data-a="in">Sign in</button>
          </div>
        </div>`;
      return this.wire();
    }

    const t = this.thread;
    if (!t) {
      this.innerHTML = `
        <div class="tex-c-empty">
          <div class="tex-c-empty-t">This conversation is not here</div>
          <div class="tex-c-empty-b">It may have been removed by its author or by an editor.</div>
          <div style="margin-top:16px"><a class="texc-btn" href="/community">Back to the spaces</a></div>
        </div>`;
      return this.wire();
    }

    const space = spaceBySlug(t.space);
    const p = t.profiles || {};
    const mine = t.author_id === state.user.id;
    const editor = !!state.profile?.is_editor;

    this.innerHTML = `
      <div class="tex-th-bar">
        <a class="tex-sp-back" href="/community#${esc(t.space)}">←
          ${esc(space ? space.name : "All spaces")}</a>
        ${mine || editor ? `<button class="tex-c-act is-quiet" type="button" data-a="del">Delete</button>` : ""}
      </div>
      <h1 class="tex-th-t">${esc(t.title)}</h1>
      <div class="tex-th-by">
        <div class="tex-c-av">${avatar(p)}</div>
        <div>
          <div class="tex-c-name">${esc(p.full_name || "Member")}</div>
          <div class="tex-c-role">${esc([p.role, p.institution].filter(Boolean).join(", "))}
            · ${esc(ago(t.created_at))}</div>
        </div>
      </div>
      <div class="tex-th-b">${esc(t.body)}</div>
      <tex-comments item-type="thread" item-slug="${t.id}"
        item-title="${esc(t.title)}" prompt="Replies"></tex-comments>`;
    this.wire();
  }

  wire() {
    this.querySelectorAll("[data-a]").forEach(el => {
      el.onclick = async () => {
        const a = el.dataset.a;
        if (a === "join") return joinModal(() => this.load());
        if (a === "in")   return signInModal(() => this.load());
        if (a === "del") {
          if (!confirm("Delete this conversation and all of its replies?")) return;
          await sb.from("threads").delete().eq("id", this.thread.id);
          location.href = "/community#" + this.thread.space;
        }
      };
    });
  }
}

customElements.define("tex-thread", TexThread);

/* ----------------------------------------------------------------- share */
// Mount anywhere on a story / tool / perspective page:
//   <tex-share></tex-share>
// Optional attributes: url (defaults to canonical or current page),
// title (defaults to the page h1 or document title), label.

const SHARE_ICONS = {
  facebook: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>',
  bluesky: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M6.1 3.3C8.5 5.1 11 8.8 12 10.8c1-2 3.5-5.7 5.9-7.5 1.7-1.3 4.1-1.9 4.1 1 0 .6-.3 4.9-.5 5.6-.6 2.4-3 3-5.2 2.7 3.8.6 4.8 2.8 2.7 4.9-3.9 4-5.6-1-6-2.3-.1-.3-.2-.6-.2-.4 0-.2-.1.1-.2.4-.4 1.3-2.1 6.3-6 2.3-2.1-2.1-1.1-4.3 2.7-4.9-2.2.3-4.6-.3-5.2-2.7C3.8 9.2 3.5 4.9 3.5 4.3c0-2.9 2.4-2.3 4.1-1Z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6.5 0h3.8v1.65h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.77c0-1.38-.03-3.15-1.96-3.15-1.97 0-2.27 1.5-2.27 3.05V21h-4V9Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.6 5.23"/><path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
};

class TexShare extends HTMLElement {
  connectedCallback() {
    this.className = "tex-sh";
    const canon = document.querySelector('link[rel="canonical"]')?.href;
    this.url = this.getAttribute("url") || canon || location.href.split("#")[0];
    this.title_ = this.getAttribute("title")
      || document.querySelector("h1")?.textContent.trim()
      || document.title;
    this.label = this.getAttribute("label") || "Share this";
    this.render();
  }

  links() {
    const u = encodeURIComponent(this.url);
    const t = encodeURIComponent(this.title_);
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      bluesky: `https://bsky.app/intent/compose?text=${t}%20${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`
    };
  }

  render() {
    const l = this.links();
    this.innerHTML = `
      <span class="tex-sh-label">${esc(this.label)}</span>
      <div class="tex-sh-row">
        <a class="tex-sh-btn" href="${l.facebook}" target="_blank" rel="noopener"
           aria-label="Share on Facebook" title="Share on Facebook">${SHARE_ICONS.facebook}</a>
        <a class="tex-sh-btn" href="${l.bluesky}" target="_blank" rel="noopener"
           aria-label="Share on Bluesky" title="Share on Bluesky">${SHARE_ICONS.bluesky}</a>
        <a class="tex-sh-btn" href="${l.linkedin}" target="_blank" rel="noopener"
           aria-label="Share on LinkedIn" title="Share on LinkedIn">${SHARE_ICONS.linkedin}</a>
        <button class="tex-sh-btn tex-sh-copy" type="button" data-el="copy">
          ${SHARE_ICONS.link}<span data-el="copytext">Copy link</span>
        </button>
      </div>`;

    this.querySelector('[data-el="copy"]').onclick = async e => {
      const btn = e.currentTarget;
      const txt = btn.querySelector('[data-el="copytext"]');
      try {
        await navigator.clipboard.writeText(this.url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = this.url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      btn.classList.add("is-done");
      btn.firstElementChild.outerHTML = SHARE_ICONS.check;
      txt.textContent = "Link copied";
      clearTimeout(this._t);
      this._t = setTimeout(() => this.render(), 2400);
    };
  }
}

customElements.define("tex-share", TexShare);
