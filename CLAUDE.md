# PlaylistApp — BTS SIO 2 SLAM

Support de cours C# / .NET 10 de Guillaume Gaillard, année 2026-2027.
5 TP progressifs (TP0 à TP4) autour d'une application de gestion de playlists.

Répondre en **français**. Modifier directement les fichiers, ne pas se contenter de suggérer.

---

## Nature du dépôt

C'est un **dépôt template** : chaque étudiant génère le sien via « Use this template »,
puis travaille dans un **GitHub Codespace**. Toute modification du `.devcontainer`
ne profite qu'aux dépôts créés **après** : les étudiants déjà partis doivent
récupérer le correctif puis **supprimer et recréer** leur Codespace, un rebuild
ne relit pas la configuration.

```
PlaylistApp/        TP1 — Console & POO
PlaylistAppEF/      TP2 — Entity Framework Core (+ .Tests, 31 tests)
PlaylistAppAPI/     TP3 API REST & SOA, TP4 événementiel (+ .Tests, 13 tests)
cours/              fiches concepts + auto-évaluations
docs/index.html     tableau de bord de progression (publié sur GitHub Pages)
docs/assets/        config.js, suivi.js, surcouche de synchronisation
DEPANNAGE.md        page d'erreurs classée par symptôme
SUIVI_SUPABASE.md   SQL de la classe et requêtes de suivi
```

## Le tableau de bord

`docs/index.html` est un fichier autonome de ~470 lignes : `PARCOURS` (5 TP,
29 missions), `QUIZ` (35 questions), état dans `var state`, persistance
`localStorage`. **Ne pas le réécrire.**

`docs/assets/suivi.js` est une **surcouche** qui enveloppe `save()` et synchronise
vers Supabase. Elle ne touche ni au rendu, ni aux données du parcours.

- `state` est déclaré en **`var`** (et non `let`) pour rester accessible à la surcouche.
- `extra_javascript` équivalent : les trois `<script>` en fin de `index.html`
  doivent rester dans l'ordre **librairie Supabase, config.js, suivi.js**.
- Clés d'état : `tp2-m1` pour une mission, `q-3-2` pour une question de quiz.
  Le chiffre après `tp` ou après `q-` donne le numéro du TP.

## Identification

L'étudiant ne saisit **pas** son numéro ici. Il passe par le portail commun :
<https://ggaillard.github.io/portail-bts/> (dépôt `ggaillard/portail-bts`).

Même origine `ggaillard.github.io` donc session Supabase partagée. `suivi.js`
appelle `qui_suis_je()` au chargement et affiche « Connecté, numéro NN », ou
renvoie vers le portail. **Ne pas réintroduire de formulaire de numéro ici** :
cela contournerait le code PIN.

## Base de données

Projet Supabase `tour-de-controle`, région Francfort. Classe `BTS2-SLAM-2026`,
25 étudiants, 5 séances (une par TP) **ouvertes en permanence** : les étudiants
avancent à leur rythme, il n'y a rien à ouvrir ni fermer, contrairement au BTS1.

La table `eleves` ne contient **ni nom, ni prénom, ni adresse**. Numéro, avatar,
code PIN. Ne jamais proposer d'y ajouter un champ nominatif.

## L'appel et le suivi en direct

**L'appel se fait au portail.** Séance **numéro 99** de la classe, « Appel -
question du jour », ouverte en permanence — 99 et non 0, puisque la séance 0
est déjà votre TP0 : une question par date, nommée
`appel-AAAA-MM-JJ` (script `APPEL.sql` du dépôt `portail-bts`). Y répondre,
c'est être présent.

C'est **le seul repère de date de ce cours**. Les 5 séances de TP étant ouvertes
en permanence, elles ne disent pas quel jour l'étudiant était là. Ne jamais
déduire la présence de l'avancement des missions : un étudiant peut avancer
depuis chez lui, un autre être présent sans rien cocher.

Pendant l'heure : portail → espace enseignant → classe `BTS2-SLAM-2026` → le TP
en cours. Les missions cochées remontent en `reponse = "ok"` ou `"ko"` et
n'entrent **pas** dans le taux de réussite ; seules les questions de quiz y
entrent. Le classement se lit donc en avancement, pas en note.

Après l'heure : vues `v_appel` et `v_absences`.

## Points de vigilance

- **`devcontainer.json` : jamais de `${localWorkspaceFolder}`.** Cette variable
  n'existe pas sur Codespaces et fait échouer la création du conteneur. C'était
  la cause du blocage historique. Le dossier `data/` est versionné via `.gitkeep`.
- **`post-create.sh` doit rester idempotent** : il tourne aussi aux rebuilds.
- **Docker n'est jamais obligatoire** pour lancer l'application. `dotnet run`
  suffit. Un étudiant bloqué sur Docker doit pouvoir avancer quand même.
- **Toute nouvelle erreur courante va dans `DEPANNAGE.md`**, classée par le
  message que l'étudiant voit à l'écran, pas par thème technique.

## Workflow

```bash
dotnet build                    # verifier que tout compile
dotnet test PlaylistAppEF.Tests # 31 tests
git add . && git commit && git push
```

Le dépôt est **public**. Demander confirmation avant tout `git push`.

---

## Le quiz : sept blocs pour cinq TP

`QUIZ` dans `docs/index.html` compte **sept** blocs, parce que le TP1 et le
TP2 en ont deux chacun. La clé d'une réponse est `q-<indice du bloc>-<question>` :

| bloc | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| TP | 0 | 1 | 1 | 2 | 2 | 3 | 4 |

`tpDeLaCle()` dans `docs/assets/suivi.js` lisait cet indice **comme** un numéro
de TP. Conséquence : le quiz LINQ était rangé sur la séance du TP2, celui du
TP2 sur les séances TP3 et TP4, et les blocs 5 et 6 étaient purement perdus —
il n'existe pas de séance numéro 5 ni 6, et l'envoi sortait en silence.

La table `TP_DU_BLOC` fait la traduction. **Ajouter un bloc de quiz oblige à
ajouter son TP dans cette table.**

## Ce que le suivi enregistre

| Clé | Valeur | Ce que c'est |
|---|---|---|
| `tp2-m1`, `tp1-c0`, `tp2-s1`, `tp0-1` | `true` / `false` | une case cochée — **un jalon** |
| `q-3-2` | `ok` / `ko` | une question de quiz |
| `q-3-2-pick` | `0` à `3` | l'option choisie |

Les 29 items du parcours se répartissent en **3 · 5 · 8 · 7 · 6**. Tous ne sont
pas des `-m` : le TP0 n'en a aucun, et chaque TP a sa fiche concept `-c0` et
ses mises en route `-s`. Le portail compte donc les clés commençant par `tp`
dont la réponse vaut `true` — ni « toutes les lignes » (les quiz seraient
comptés), ni « les `-m` seuls » (les deux tiers manqueraient).

`dernierEnvoi` doit être construit sur ce que le **serveur** renvoie, jamais
sur l'état fusionné : autrement, tout ce que le poste a en local et que le
serveur n'a pas est réputé déjà envoyé, donc jamais transmis.
