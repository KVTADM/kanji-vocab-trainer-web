// ============================================================
// Profils publics : photo, niveau de japonais, description.
//
// Un profil est ce qu'on voit d'une personne à côté d'un deck qu'elle a
// partagé ou d'un commentaire qu'elle a écrit. Il est lisible sans compte —
// sinon un visiteur verrait des decks sans auteur.
//
// Le pseudo affiché vient toujours d'ici ou de la base, jamais d'un champ
// rempli par le client.
// ============================================================

const profilsCache = new Map();   // user_id -> { id, pseudo, avatar_url, niveau, bio }
const NIVEAUX = [
  ['', 'Non précisé'],
  ['debutant', 'Débutant'],
  ['n5', 'JLPT N5'],
  ['n4', 'JLPT N4'],
  ['n3', 'JLPT N3'],
  ['n2', 'JLPT N2'],
  ['n1', 'JLPT N1'],
  ['natif', 'Langue maternelle']
];

function libelleNiveau(code) {
  const trouve = NIVEAUX.find(n => n[0] === code);
  return trouve ? trouve[1] : 'Non précisé';
}

// Charge les profils manquants en une seule requête. Sans ce regroupement,
// une liste de trente decks déclencherait trente requêtes.
async function chargerProfils(ids) {
  const manquants = [...new Set(ids)].filter(id => id && !profilsCache.has(id));
  if (!manquants.length || !window.sb) return;
  try {
    const { data, error } = await window.sb
      .from('profiles').select('id,pseudo,avatar_url,niveau,bio').in('id', manquants);
    if (error) throw error;
    (data || []).forEach(p => profilsCache.set(p.id, p));
    // Un identifiant sans profil est mis en cache vide, sinon on le
    // redemanderait à chaque affichage.
    manquants.forEach(id => { if (!profilsCache.has(id)) profilsCache.set(id, null); });
  } catch (err) {
    // Un profil absent n'empêche rien d'autre de s'afficher : on retombe sur
    // l'initiale du pseudo.
  }
}

function profilDe(userId) {
  return profilsCache.get(userId) || null;
}

// Une couleur stable par personne, tirée du pseudo : deux comptes différents
// gardent deux teintes différentes d'une session à l'autre.
function teinteDe(texte) {
  let n = 0;
  for (let i = 0; i < texte.length; i++) n = (n * 31 + texte.charCodeAt(i)) % 360;
  return n;
}

// La photo si elle existe, sinon l'initiale sur un fond coloré. Jamais une
// image cassée : un avatar_url mort retomberait sur l'initiale via onerror.
function avatarHtml(userId, pseudo, taille) {
  const p = profilDe(userId);
  const nom = (p && p.pseudo) || pseudo || '?';
  const px = taille || 32;
  const initiale = escapeHtml(nom.trim().charAt(0).toUpperCase() || '?');
  const teinte = teinteDe(nom);
  const secours = `<span class="avatar-initiale" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.42)}px;background:hsl(${teinte} 42% 32%);">${initiale}</span>`;
  if (p && p.avatar_url) {
    return `<img class="avatar-photo" src="${escapeHtml(p.avatar_url)}" alt="" width="${px}" height="${px}"
      style="width:${px}px;height:${px}px;"
      onerror="this.outerHTML=this.dataset.secours" data-secours="${escapeHtml(secours)}" />`;
  }
  return secours;
}

// Bloc « par Untel », avec photo, utilisable partout.
function auteurHtml(userId, pseudo, taille) {
  return `
    <span class="auteur">
      ${avatarHtml(userId, pseudo, taille || 24)}
      <span class="auteur-pseudo">${escapeHtml((profilDe(userId) || {}).pseudo || pseudo || '')}</span>
    </span>`;
}

// ---------- Modification de son propre profil ----------

async function enregistrerProfil(champs) {
  if (!window.accountUser) return { ok: false, erreur: 'Non connecté.' };
  const { error } = await window.sb.from('profiles').update(champs).eq('id', window.accountUser.id);
  if (error) return { ok: false, erreur: error.message };
  const actuel = profilsCache.get(window.accountUser.id) || { id: window.accountUser.id, pseudo: window.accountUser.pseudo };
  profilsCache.set(window.accountUser.id, { ...actuel, ...champs });
  Object.assign(window.accountUser, champs);
  return { ok: true };
}

const AVATAR_TAILLE_MAX = 300 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// L'envoi est vérifié ici ET par la base : ce contrôle-ci sert à donner un
// message clair tout de suite, pas à faire la sécurité.
async function envoyerAvatar(fichier) {
  if (!fichier) return { ok: false, erreur: 'Aucun fichier choisi.' };
  if (!AVATAR_TYPES.includes(fichier.type)) {
    return { ok: false, erreur: 'Format accepté : JPEG, PNG ou WebP.' };
  }
  if (fichier.size > AVATAR_TAILLE_MAX) {
    return { ok: false, erreur: `Image trop lourde (${Math.round(fichier.size / 1024)} ko). Maximum 300 ko.` };
  }

  const extension = fichier.type === 'image/png' ? 'png' : (fichier.type === 'image/webp' ? 'webp' : 'jpg');
  // Le dossier porte l'identifiant du compte : c'est ce que la règle de
  // stockage vérifie. Le nom change à chaque envoi pour contourner le cache
  // du navigateur, qui garderait sinon l'ancienne photo.
  const chemin = `${window.accountUser.id}/avatar-${Date.now()}.${extension}`;

  const { error } = await window.sb.storage.from('avatars')
    .upload(chemin, fichier, { cacheControl: '3600', upsert: false });
  if (error) return { ok: false, erreur: error.message };

  const { data } = window.sb.storage.from('avatars').getPublicUrl(chemin);
  const url = data && data.publicUrl;
  if (!url) return { ok: false, erreur: "L'image est envoyée mais son adresse est introuvable." };

  const res = await enregistrerProfil({ avatar_url: url });
  if (!res.ok) return res;

  // Ménage : on retire les anciennes photos, sinon chaque changement laisse
  // un fichier orphelin qui compte dans le quota.
  try {
    const { data: fichiers } = await window.sb.storage.from('avatars').list(window.accountUser.id);
    const vieux = (fichiers || [])
      .map(f => `${window.accountUser.id}/${f.name}`)
      .filter(c => c !== chemin);
    if (vieux.length) await window.sb.storage.from('avatars').remove(vieux);
  } catch (e) { /* un orphelin n'empêche rien, on n'échoue pas là-dessus */ }

  return { ok: true, url };
}

async function retirerAvatar() {
  if (!window.accountUser) return;
  try {
    const { data: fichiers } = await window.sb.storage.from('avatars').list(window.accountUser.id);
    const tous = (fichiers || []).map(f => `${window.accountUser.id}/${f.name}`);
    if (tous.length) await window.sb.storage.from('avatars').remove(tous);
  } catch (e) { /* idem */ }
  return enregistrerProfil({ avatar_url: '' });
}

// ---------- Le bloc « Mon profil », inséré dans l'onglet Compte ----------

async function chargerMonProfil() {
  if (!window.accountUser) return;
  profilsCache.delete(window.accountUser.id);
  await chargerProfils([window.accountUser.id]);
  const p = profilDe(window.accountUser.id);
  if (p) Object.assign(window.accountUser, { avatar_url: p.avatar_url, niveau: p.niveau, bio: p.bio });
}

function htmlBlocProfil() {
  const u = window.accountUser;
  if (!u) return '';
  const p = profilDe(u.id) || {};
  return `
    <div class="card" id="carteProfil">
      <h3 class="deck-section-titre">Mon profil public</h3>
      <p class="pub-aide">C'est ce que les autres voient à côté des decks que tu partages et des commentaires que tu écris.</p>

      <div class="profil-tete">
        <div id="profilApercu">${avatarHtml(u.id, u.pseudo, 72)}</div>
        <div class="profil-photo-actions">
          <label class="secondary profil-bouton-fichier" for="profilFichier">Changer la photo</label>
          <input type="file" id="profilFichier" accept="image/jpeg,image/png,image/webp" style="display:none;" />
          ${p.avatar_url ? `<button class="lien-retour" id="btnRetirerAvatar">Retirer la photo</button>` : ''}
          <p class="pub-aide">JPEG, PNG ou WebP, 300 ko maximum.</p>
          <p class="pub-erreur" id="profilErreurPhoto" style="display:none;"></p>
        </div>
      </div>

      <label class="pub-label" for="profilNiveau">Ton niveau de japonais</label>
      <select id="profilNiveau" class="pub-champ pub-champ-court">
        ${NIVEAUX.map(([v, lib]) => `<option value="${v}" ${(p.niveau || '') === v ? 'selected' : ''}>${lib}</option>`).join('')}
      </select>

      <label class="pub-label" for="profilBio">Description</label>
      <textarea id="profilBio" class="pub-champ pub-zone" rows="3" maxlength="400"
        placeholder="Deux lignes sur toi : ce que tu apprends, pourquoi, depuis quand.">${escapeHtml(p.bio || '')}</textarea>
      <p class="pub-aide"><span id="profilCompteur">${(p.bio || '').length}</span>/400</p>

      <div class="pub-actions">
        <button class="primary" id="btnEnregistrerProfil">Enregistrer</button>
      </div>
    </div>`;
}

function brancherBlocProfil() {
  const u = window.accountUser;
  if (!u || !$('#carteProfil')) return;

  const bio = $('#profilBio');
  if (bio) bio.oninput = () => { $('#profilCompteur').textContent = bio.value.length; };

  $('#btnEnregistrerProfil').onclick = async () => {
    const res = await enregistrerProfil({
      niveau: $('#profilNiveau').value,
      bio: $('#profilBio').value.trim()
    });
    showToast(res.ok ? 'Profil enregistré' : 'Erreur : ' + res.erreur);
  };

  const champFichier = $('#profilFichier');
  if (champFichier) champFichier.onchange = async () => {
    const erreur = $('#profilErreurPhoto');
    erreur.style.display = 'none';
    const fichier = champFichier.files && champFichier.files[0];
    const res = await envoyerAvatar(fichier);
    champFichier.value = '';
    if (!res.ok) {
      erreur.textContent = res.erreur;
      erreur.style.display = '';
      return;
    }
    $('#profilApercu').innerHTML = avatarHtml(u.id, u.pseudo, 72);
    showToast('Photo mise à jour');
    if (typeof renderAccount === 'function') renderAccount();
  };

  const btnRetirer = $('#btnRetirerAvatar');
  if (btnRetirer) btnRetirer.onclick = async () => {
    if (!confirm('Retirer ta photo de profil ?')) return;
    await retirerAvatar();
    showToast('Photo retirée');
    if (typeof renderAccount === 'function') renderAccount();
  };
}

window.kvtProfils = {
  chargerProfils, profilDe, avatarHtml, auteurHtml, libelleNiveau,
  chargerMonProfil, htmlBlocProfil, brancherBlocProfil
};
