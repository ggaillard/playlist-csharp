/*
 * Suivi centralisé PlaylistApp — BTS SIO 2 SLAM
 *
 * Surcouche du tableau de bord : ne modifie ni PARCOURS, ni QUIZ, ni le rendu.
 * Elle intercepte save(), pousse l'état vers Supabase, et le recharge à l'ouverture.
 *
 * Sans identification, ou si le réseau tombe, le tableau de bord continue de
 * fonctionner sur localStorage exactement comme avant.
 *
 * Dépendances : supabase-js v2 (global `supabase`), window.TDC_CONFIG.
 */
(function () {
  "use strict";

  var CFG = window.TDC_CONFIG;
  if (!CFG || !CFG.url || !CFG.cle || !CFG.classeCode) {
    console.warn("[suivi] TDC_CONFIG absent — mode local uniquement.");
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.warn("[suivi] supabase-js non chargé — mode local uniquement.");
    return;
  }

  var CLE_NUM = "playlistapp-numero";

  // Portail commun. Même origine que ce site : la session y est partagée,
  // l'étudiant ne saisit donc son numéro qu'une fois par poste.
  var PORTAIL = "/portail-bts/";
  var sb = window.supabase.createClient(CFG.url, CFG.cle, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var eleveNumero = null;
  var seanceParNumero = {};   // 0..4 -> id de séance
  var dernierEnvoi = {};      // dernier état confirmé côté serveur
  var minuteur = null;

  // ── Mapping d'une clé d'état vers le TP concerné ────────────────────────
  // Missions : "tp2-m1" -> TP 2. Le numéro est dans la clé, rien à traduire.
  //
  // Quiz : "q-2-3" -> bloc 2, question 3. Attention, le premier nombre est
  // l'INDICE DU BLOC de quiz, pas le numéro du TP : il y a sept blocs pour
  // cinq TP, le TP1 et le TP2 en ayant deux chacun. Les confondre envoyait
  // le quiz LINQ sur la séance du TP2, celui du TP2 sur les séances TP3 et
  // TP4 — et perdait purement les blocs 5 et 6, puisqu'il n'existe pas de
  // séance numéro 5 ni 6 : l'envoi sortait en silence.
  //
  // Cette table suit l'ordre des blocs dans QUIZ (docs/index.html). Ajouter
  // un bloc de quiz oblige à ajouter son TP ici.
  var TP_DU_BLOC = [0, 1, 1, 2, 2, 3, 4];

  function tpDeLaCle(cle) {
    var m = /^tp(\d)/.exec(cle);
    if (m) return parseInt(m[1], 10);
    m = /^q-(\d+)-/.exec(cle);
    if (m) {
      var bloc = parseInt(m[1], 10);
      return bloc < TP_DU_BLOC.length ? TP_DU_BLOC[bloc] : null;
    }
    return null;
  }

  // ── Interface d'identification ──────────────────────────────────────────
  function construireBarre() {
    var barre = document.createElement("div");
    barre.id = "suivi-barre";
    barre.innerHTML =
      '<div class="suivi-in">' +
        '<span class="suivi-pastille" id="suivi-pastille"></span>' +
        '<span class="suivi-txt" id="suivi-txt">Vérification de votre identité…</span>' +
        '<a class="suivi-btn" id="suivi-lien" hidden>Ouvrir le portail</a>' +
        '<a class="suivi-btn suivi-btn-sec" id="suivi-out" hidden>Ce n\'est pas moi</a>' +
      '</div>';

    var style = document.createElement("style");
    style.textContent =
      '#suivi-barre{background:var(--card);border:1px solid var(--border);' +
        'border-radius:12px;padding:.7rem .9rem;margin:0 0 1rem}' +
      '.suivi-in{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}' +
      '.suivi-pastille{width:9px;height:9px;border-radius:50%;background:var(--muted);flex:none}' +
      '.suivi-pastille.ok{background:var(--green)}' +
      '.suivi-pastille.ko{background:var(--amber)}' +
      '.suivi-txt{color:var(--muted);font-size:.86rem;flex:1 1 14rem}' +
      '.suivi-form{display:flex;align-items:center;gap:.45rem}' +
      '.suivi-lbl{color:var(--muted);font-size:.8rem}' +
      '.suivi-inp{width:3.6rem;background:var(--track);color:var(--text);' +
        'border:1px solid var(--border);border-radius:7px;padding:.32rem .5rem;' +
        'font:inherit;font-size:.9rem;text-align:center}' +
      '.suivi-inp:focus{outline:2px solid var(--blue);outline-offset:1px}' +
      '.suivi-btn{background:var(--blue);color:#0d1117;border:0;border-radius:7px;' +
        'padding:.36rem .7rem;font:inherit;font-size:.84rem;font-weight:600;cursor:pointer;' +
        'text-decoration:none;display:inline-block;white-space:nowrap}' +
      '.suivi-btn:hover{filter:brightness(1.1)}' +
      '.suivi-btn:focus-visible{outline:2px solid var(--text);outline-offset:2px}' +
      '.suivi-btn-sec{background:var(--track);color:var(--muted)}';
    document.head.appendChild(style);

    var hote = document.querySelector(".wrap");
    hote.insertBefore(barre, hote.firstChild);

    document.getElementById("suivi-lien").href = PORTAIL;
    document.getElementById("suivi-out").href = PORTAIL;
  }

  function etat(couleur, texte, connecte) {
    document.getElementById("suivi-pastille").className = "suivi-pastille " + couleur;
    document.getElementById("suivi-txt").textContent = texte;
    document.getElementById("suivi-lien").hidden = !!connecte;
    document.getElementById("suivi-out").hidden = !connecte;
  }

  // ── Identité reprise du portail ─────────────────────────────────────────
  function reprendreIdentite() {
    return sb.rpc("qui_suis_je").then(function (r) {
      if (r.error || !r.data) {
        etat("", "Progression enregistrée sur ce poste uniquement. " +
                 "Identifiez-vous sur le portail pour qu'elle remonte à votre enseignant.", false);
        return false;
      }
      if (r.data.classe_code !== CFG.classeCode) {
        etat("ko", "Vous êtes connecté en " + r.data.classe_nom +
                   ", qui ne suit pas ce projet.", true);
        return false;
      }
      eleveNumero = r.data.numero;
      localStorage.setItem(CLE_NUM, eleveNumero);
      etat("ok", "Connecté, numéro " + eleveNumero + ".", true);
      return true;
    });
  }

  // ── Récupération de l'état depuis le serveur ────────────────────────────
  function recuperer() {
    sb.from("reponses").select("question,reponse").then(function (r) {
      if (r.error || !r.data) return;
      if (!r.data.length) { dernierEnvoi = aplatir(window.state); envoyer(); return; }

      // « dernierEnvoi » doit refléter ce que le SERVEUR a, pas l'état fusionné.
      // En le construisant sur la fusion, tout ce que ce poste avait en local
      // et que le serveur n'avait pas était réputé déjà envoyé, donc jamais
      // transmis. C'est ce qui aurait laissé les réponses perdues du TP3 et du
      // TP4 sur les postes des étudiants ; ainsi elles repartent d'elles-mêmes.
      var serveur = {};
      r.data.forEach(function (ligne) {
        var v = ligne.reponse;
        if (v === "true") v = true;
        else if (v === "false" || v === "" || v === null) return;
        else if (/^\d+$/.test(v)) v = parseInt(v, 10);
        window.state[ligne.question] = v;
        serveur[ligne.question] = String(ligne.reponse);
      });
      dernierEnvoi = serveur;
      try { localStorage.setItem("playlistapp-progression", JSON.stringify(window.state)); } catch (e) {}
      window.render();
      window.renderQuiz();
      envoyer();
    });
  }

  function aplatir(s) {
    var out = {};
    Object.keys(s || {}).forEach(function (k) { out[k] = String(s[k]); });
    return out;
  }

  // ── Envoi des changements ───────────────────────────────────────────────
  function envoyer() {
    if (!eleveNumero) return;
    var courant = aplatir(window.state);
    var aEnvoyer = [];

    Object.keys(courant).forEach(function (k) {
      if (dernierEnvoi[k] !== courant[k]) aEnvoyer.push([k, courant[k]]);
    });
    Object.keys(dernierEnvoi).forEach(function (k) {
      if (!(k in courant)) aEnvoyer.push([k, ""]);
    });
    if (!aEnvoyer.length) return;

    var promesses = aEnvoyer.map(function (paire) {
      var tp = tpDeLaCle(paire[0]);
      var sid = seanceParNumero[tp];
      if (sid === undefined) return Promise.resolve();
      return sb.rpc("repondre", {
        p_seance_id: sid, p_question: paire[0], p_reponse: paire[1]
      });
    });

    Promise.all(promesses).then(function () {
      dernierEnvoi = courant;
      etat("ok", "Connecté — numéro " + eleveNumero + ". Dernier enregistrement à " +
        new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ".", true);
    }).catch(function () {
      etat("ko", "Enregistrement en attente — vérifiez votre connexion.", true);
    });
  }

  function envoiDifferé() {
    clearTimeout(minuteur);
    minuteur = setTimeout(envoyer, 700);
  }

  // ── Démarrage ───────────────────────────────────────────────────────────
  function demarrer() {
    construireBarre();

    // On enveloppe save() : le comportement local est conservé à l'identique.
    var saveOrigine = window.save;
    window.save = function (s) {
      saveOrigine(s);
      envoiDifferé();
    };

    sb.auth.getSession().then(function (s) {
      // Pas de session : on en ouvre une anonyme, sans identifier personne.
      if (s.data && s.data.session) return null;
      return sb.auth.signInAnonymously();
    }).then(function () {
      return sb.from("seances")
        .select("numero,id,classe_id,classes!inner(code)")
        .eq("classes.code", CFG.classeCode)
        .then(function (res) {
          (res.data || []).forEach(function (s) { seanceParNumero[s.numero] = s.id; });
          return reprendreIdentite();
        });
    }).then(function (identifie) {
      if (identifie) recuperer();
    }).catch(function () {
      etat("ko", "Suivi indisponible — progression conservée sur ce poste.", false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
