"""Build web/guide/index.html from shots.json and the content below."""
import json, pathlib, html, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
M = json.loads((ROOT / 'tools' / 'shots.json').read_text())
e = html.escape
UPDATED = datetime.date.today().strftime('%B %-d, %Y')

LEG = {
 'd_main': {1:'<b>Sections.</b> Vault, Generator, Health, Activity, Settings and this Guide.', 2:'<b>Labels.</b> Click one to see only those accounts. Sub-labels sit indented under their parent, and the counts include them.', 3:'<b>Search.</b> Matches names, usernames, emails, websites, labels, notes and admins. Type <kbd>#work</kbd> to filter by label.', 4:'<b>View.</b> Switch between Classic (notes) and Modern (cards).', 5:'<b>Lock.</b> Locks right away. You need your password and passcode to get back in.', 6:'<b>Add.</b> Start a new account. Shortcut: <kbd>N</kbd>.', 7:'<b>Quick copy.</b> Copy the username or password without opening the account.', 8:'<b>The open account.</b> Everything stored for it, with a copy button on every line.', 9:'<b>Sort.</b> Recently edited, name, recently copied, date stored or leaf number.', 10:'<b>Status.</b> Where your vault is saved, plus a Lock button.'},
 'p_list': {1:'<b>Search</b> everything except the secret values.', 2:'<b>Label chips.</b> Tap one to filter. Swipe for more.', 3:'<b>View switch:</b> Classic notes or Modern cards.', 4:'<b>Lock</b> now.', 5:'<b>Quick copy</b> username or password.', 6:'<b>Add</b> an account.', 7:'<b>Bottom bar:</b> Vault, Generator, Health, Activity, Settings.'},
 'd_detail': {1:'<b>Pin.</b> Keeps this account at the top of the list.', 2:'<b>Edit.</b> Change any detail. The old password is kept in History.', 3:'<b>More.</b> Edit as note, duplicate, or delete.', 4:'<b>Open the website</b> in a new tab.', 5:'<b>Strength rating.</b> Extra pills warn when a password is reused or overdue.', 6:'<b>Show.</b> Reveals the value. It hides itself again after 30 seconds.', 7:'<b>Copy.</b> Copies the value and records the time. Tapping anywhere on the row does the same.', 8:'<b>2FA code.</b> A live code that changes every 30 seconds. The ring shows the time left.'},
 'd_history': {1:'<b>Record.</b> Leaf number, date stored, last edit, when the password was set, last copy and copy count.', 2:'<b>Changes.</b> Every edit, with date and time.', 3:'<b>Old passwords and keys.</b> Earlier values, which you can show and copy.', 4:'<b>Copies.</b> Every time something was copied from this account.'},
 'd_classic': {1:'<b>Folders.</b> Your labels, shown like folders in a notes app.', 2:'<b>Date groups.</b> Notes are grouped by when you last edited them. Pinned accounts sit on top.', 3:'<b>The open note</b> is highlighted.', 4:'<b>Dates.</b> When it was stored and last edited.', 5:'<b>Hidden values</b> show as dots. Tap the dots to show them.', 6:'<b>Copy</b> any line.'},
 'd_classic_edit': {1:'<b>Type it like a note.</b> First line is the name, then one <kbd>Label: value</kbd> per line.', 2:'<b>Insert password</b> puts a new strong password where your cursor is.', 3:'<b>Edit as form.</b> Switch editors any time without losing anything.', 4:'<b>Save.</b> Vaultleaf turns the lines into fields.', 5:'<b>Cheat sheet</b> of the labels Vaultleaf understands.'},
 'd_templates': {1:'<b>Website or app login.</b> Username, email and password.', 2:'<b>Ready-made forms</b> such as Crypto wallet add the right fields for you.', 3:'<b>Write it as a note,</b> the Classic way.', 4:'<b>Import from Notes</b> to add many at once.'},
 'd_editor': {1:'<b>Tool or service name,</b> like Netflix or AWS.', 2:'<b>Account name,</b> for when you have more than one account at the same service.', 3:'<b>Date stored.</b> Set it to when you first saved the account, such as the date on your old note.', 4:'<b>Password,</b> hidden while you type. Tap the eye to check it.', 5:'<b>Generate</b> fills in a strong password.', 6:'<b>Strength meter</b> with a guess-time estimate.'},
 'd_editor2': {1:'<b>Add a field:</b> password, PIN, key or token, secret phrase, 2FA code, hidden text, text, link, email, phone, date or note.', 2:'<b>Security questions</b> with hidden answers.', 3:'<b>Admins:</b> the people who manage this account.', 4:'<b>Each admin</b> has a name, email and role.'},
 'd_editor3': {1:'<b>Labels.</b> Tap to add or remove.', 2:'<b>New label.</b> Type <kbd>Work/Cloud</kbd> to make a sub-label.', 3:'<b>Reminder</b> to change the password, from every 30 days to once a year.', 4:'<b>Save.</b> The change is added to History.'},
 'd_import': {1:'<b>Paste</b> one note or many.', 2:'<b>Separator.</b> Tell Vaultleaf how your notes are split up.', 3:'<b>Label</b> everything you import, such as Imported.', 4:'<b>Preview.</b> Check the names and detail counts first.', 5:'<b>Import.</b>'},
 'd_label': {1:'<b>Name.</b>', 2:'<b>Inside.</b> Pick a parent to make this a sub-label.', 3:'<b>Color,</b> used for the dot and the account tiles.'},
 'd_generator': {1:'<b>Your new password.</b> Numbers and symbols are colored so they are easier to read.', 2:'<b>Strength</b> and how long it would take to guess.', 3:'<b>New password.</b>', 4:'<b>Copy.</b>', 5:'<b>Use for an account.</b> Opens an account with this password filled in.', 6:'<b>Kind:</b> random characters, or a passphrase of real words.', 7:'<b>Options:</b> length and which characters to use.'},
 'd_health': {1:'<b>Score.</b> The share of your passwords with no problems.', 2:'<b>Counts</b> of weak, reused and overdue passwords.', 3:'<b>Tap any account</b> to open it and fix it.'},
 'd_activity': {1:'<b>Filter:</b> everything, copies only, or changes only.', 2:'<b>Each event</b> shows what happened and to which account. Click to open it.', 3:'<b>Time.</b> Hover for the full date.'},
 'd_settings': {1:'<b>Guide.</b> Opens this page inside Vaultleaf.', 2:'<b>Name and email,</b> printed on your backups.', 3:'<b>Change master password.</b>', 4:'<b>Change passcode.</b>', 5:'<b>New recovery key.</b> The old key stops working.', 6:'<b>Security choices</b> such as auto-lock. See the table below.'},
 'd_settings2': {1:'<b>Back up</b> to an encrypted file.', 2:'<b>Restore</b> from a backup file.', 3:'<b>Import from Notes.</b>', 4:'<b>Import a CSV</b> from another password manager or browser.', 5:'<b>Export as CSV.</b> Not encrypted.'},
 'd_settings3': {1:'<b>Theme:</b> Auto follows your device, or choose Light or Dark.', 2:'<b>Labels,</b> with sub-labels indented and counts.', 3:'<b>Edit</b> to rename, recolor, move or delete a label.'},
 'd_chpw': {1:'<b>Current master password.</b>', 2:'<b>Current passcode.</b>', 3:'<b>New password</b> with a strength meter.'},
 'd_backup': {1:'<b>Download</b> the encrypted backup file.', 2:'<b>Copy</b> it as text instead, then paste it into a note or an email to yourself.'},
 'd_restore': {1:'<b>Choose</b> the backup file.', 2:'<b>Or paste</b> the backup text.', 3:'<b>Unlock with</b> the password and passcode it was made with, or your recovery key.', 4:'<b>Enter them here.</b>'},
 'd_more': {1:'<b>Edit as note:</b> every detail as plain text.', 2:'<b>Duplicate:</b> start a similar account.', 3:'<b>Delete.</b> It stays in Recently deleted for 30 days.'},
 'd_trash': {1:'<b>Recently deleted.</b>', 2:'<b>Restore</b> puts it back.', 3:'<b>Delete forever.</b> This can\'t be undone.'},
 'p_setup_1': {1:'<b>Name and email</b> are optional. They appear on your backups.', 2:'<b>Have a backup?</b> Restore it here instead.'},
 'p_setup_2': {1:'<b>Master password,</b> at least 10 characters.', 2:'<b>Strength meter.</b> It must reach Fair or better.', 3:'<b>Suggest a passphrase</b> if you want one made for you.'},
 'p_setup_3': {1:'<b>Length:</b> 4, 6 or 8 digits.', 2:'<b>Dots</b> fill as you type.', 3:'<b>Keypad.</b> A keyboard works too.'},
 'p_setup_4': {1:'<b>Recovery key.</b> Write it down or save it.', 2:'<b>Copy</b> or download it.', 3:'<b>Confirm</b> you saved it.', 4:'<b>Open your vault.</b>'},
 'p_login1': {1:'<b>Master password.</b>', 2:'<b>Forgot it?</b> Use your recovery key.'},
 'p_login2': {1:'<b>Passcode dots.</b>', 2:'<b>Keypad.</b> It unlocks as soon as the last digit is in.', 3:'<b>Back</b> to the password step.'},
 'p_recover': {1:'<b>Recovery key.</b> Dashes and spaces are optional.', 2:'<b>Check key,</b> then choose a new password and passcode.'},
 'p_detail': {1:'<b>Back</b> to the list.', 2:'<b>Secret phrases</b> appear as a numbered word grid.', 3:'<b>Hide or copy.</b>'},
 'p_note': {1:'<b>Name</b> of the account.', 2:'<b>Tap the dots</b> to show a hidden value.'},
 'p_settings': {1:'<b>Lock</b> from any page.', 2:'<b>Guide</b> link.'},
 'p_classic': {1:'<b>Date group.</b>', 2:'<b>A note.</b> Tap to open it.'},
}

def shot(name, alt, kind='desk', caption='', legend=True, cls=''):
    m = M[name]
    marks = ''.join(f'<span class="mk" style="left:{k["x"]}%;top:{k["y"]}%;width:{k["w"]}%;height:{k["h"]}%" data-n="{k["n"]}" aria-hidden="true"></span>' for k in m['marks'])
    leg = ''
    if legend and m['marks'] and name in LEG:
        items = ''.join(f'<li value="{k["n"]}">{LEG[name].get(k["n"], e(k["label"]))}</li>' for k in sorted(m['marks'], key=lambda k: k['n']))
        leg = f'<ol class="legend">{items}</ol>'
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    return (f'<figure class="shot {kind} {cls}"><div class="frame"><img src="/guide/img/{name}.webp" width="{m["w"]}" height="{m["h"]}" alt="{e(alt)}" loading="lazy" decoding="async">{marks}</div>{cap}</figure>', leg)

def fig(name, alt, kind='desk', caption='', side=False):
    f, leg = shot(name, alt, kind, caption)
    if side and leg:
        return f'<div class="pair">{f}{leg}</div>'
    return f + leg

def phones(items):
    cells = []
    for i, (name, alt, cap) in enumerate(items, 1):
        f, leg = shot(name, alt, 'phone', '')
        cells.append(f'<div class="step"><div class="step-n">{i}</div><h4>{cap}</h4>{f}{leg}</div>')
    return f'<div class="steps-row">{"".join(cells)}</div>'

SECTIONS = []
def sec(id_, title, body, lead=''):
    SECTIONS.append((id_, title))
    return f'<section id="{id_}" class="sec"><h2>{title}</h2>{f"<p class=lead>{lead}</p>" if lead else ""}{body}</section>'

YES = '<span class="yes" aria-label="Yes">✓</span>'; NO = '<span class="no" aria-label="No">—</span>'

body = []
body.append(sec('roles', 'Who does what', f'''
<div class="roles">
  <div class="role"><div class="role-ic">{''}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 1 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0"/></svg></div>
    <h3>Everyone</h3><p>Anyone who opens Vaultleaf gets their own private vault in their own browser. They set their own password and passcode and manage their own accounts.</p>
    <ul class="ticks"><li><a href="#start">Set up and unlock</a></li><li><a href="#tour">Find, copy and edit accounts</a></li><li><a href="#views">Use the Classic notes view</a></li><li><a href="#backup">Back up and move devices</a></li></ul></div>
  <div class="role admin"><div class="role-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4"/></svg></div>
    <h3>Admins</h3><p>The person who runs the Vaultleaf website on Vercel and GitHub. Admins decide who can open the site and publish updates. They can't see or reset anyone's passwords.</p>
    <ul class="ticks"><li><a href="#admins">Control access to the site</a></li><li><a href="#admins">Publish updates and roll back</a></li><li><a href="#admins">Help someone who's locked out</a></li><li><a href="#security">Explain how data is protected</a></li></ul></div>
</div>
<div class="table-wrap"><table class="matrix"><caption class="sr">What each role can do</caption>
<thead><tr><th scope="col">Task</th><th scope="col">Everyone</th><th scope="col">Admin</th></tr></thead><tbody>
<tr><th scope="row">Set up a vault, add, copy, edit and organize accounts</th><td>{YES}</td><td>{YES}</td></tr>
<tr><th scope="row">Back up and restore their own vault</th><td>{YES}</td><td>{YES}</td></tr>
<tr><th scope="row">Reset a forgotten password</th><td>With their own recovery key</td><td>{NO} Nobody can</td></tr>
<tr><th scope="row">See another person's passwords</th><td>{NO}</td><td>{NO}</td></tr>
<tr><th scope="row">Choose who can open the website</th><td>{NO}</td><td>{YES}</td></tr>
<tr><th scope="row">Publish updates, roll back, change the web address</th><td>{NO}</td><td>{YES}</td></tr>
</tbody></table></div>
<p class="note"><b>Two kinds of "admin".</b> Inside an account, the <b>Admins</b> section lists the people who manage that service, like the owner of a company AWS account. That's just information you store. It's separate from the admin who runs this website.</p>
'''))

body.append(sec('start', 'Set up your vault', phones([
    ('p_setup_1', 'Setup screen asking for an optional name and email', 'Add your name'),
    ('p_setup_2', 'Choosing a master password with a strength meter', 'Choose a master password'),
    ('p_setup_3', 'Setting a 6-digit passcode on a keypad', 'Set a passcode'),
    ('p_setup_4', 'The recovery key shown in a highlighted box', 'Save your recovery key')]) + '''
<div class="callout warn"><b>Keep your recovery key somewhere safe.</b> It's the only way back in if you forget your password or passcode. Write it on paper, or keep the downloaded kit in a place other than this device. Nobody, including your admin, can reset your vault.</div>
<p>The last screen also offers four example accounts to explore. They're labeled Examples, and you can remove them in one tap from the banner above the list.</p>''',
 'Setup takes about a minute. Each device starts with its own setup, or with a backup from another device.'))

body.append(sec('unlock', 'Unlock and lock', f'''
<div class="grid3">{shot('p_login1', 'Welcome back screen with the master password field', 'phone')[0]}{shot('p_login2', 'Passcode keypad with two digits entered', 'phone')[0]}{shot('p_recover', 'Recovery key entry screen', 'phone')[0]}</div>
<div class="cols3"><div><h4>1. Password</h4><p>Type your master password and press Continue.</p></div><div><h4>2. Passcode</h4><p>Tap your digits. Vaultleaf unlocks as soon as the last one is in.</p></div><div><h4>Forgot?</h4><p>Choose <b>Forgot your password or passcode?</b>, enter your recovery key, then pick new ones.</p></div></div>
<ul class="facts">
<li><b>Wrong tries.</b> If either part is wrong, Vaultleaf doesn't say which. After 5 wrong tries you wait 30 seconds, and the wait doubles each time up to 15 minutes.</li>
<li><b>Auto-lock.</b> Vaultleaf locks after 5 minutes without activity, and when it has been in the background for over a minute. Change both in <a href="#settings">Settings</a>.</li>
<li><b>Lock now.</b> Use the lock button at the top of the list, or Lock at the bottom of the sidebar.</li>
</ul>'''))

body.append(sec('tour', 'Find your way around', fig('d_main', 'Vaultleaf on a computer: sidebar with sections and labels, account list, and an open AWS account', 'desk') + f'''
<h3>On a phone</h3><div class="pair">{shot('p_list', 'Vaultleaf on a phone: search, label chips, account cards and bottom bar', 'phone')[0]}{shot('p_list', '', 'phone')[1]}</div>''',
 'On a computer you see everything side by side. On a phone the open account slides over the list, and sections move to a bar at the bottom.'))

body.append(sec('account', 'Open an account', fig('d_detail', 'An open account with website, username, email, password and 2FA code rows', 'desk', side=True) +
 '<h3>Showing a hidden value</h3>' + shot('d_revealed', 'Password row with the password shown in colored characters', 'desk', 'Shown passwords use a font where 0 and O, 1 and l look different. Numbers are gold and symbols are green.')[0] +
 '<h3>History and records</h3>' + fig('d_history', 'Record grid and History tabs for changes, old passwords and copies', 'desk', side=True) +
 '<h3>Secret phrases</h3><div class="pair">' + ''.join(shot('p_detail', 'Crypto wallet on a phone showing a 12-word secret phrase as a numbered grid', 'phone')) + '</div>',
 'Every account is a page of its own. Tap any line to copy it, and Vaultleaf notes the time.'))

body.append(sec('views', 'Classic and Modern views', fig('d_classic', 'Classic view: folders, notes grouped by date, and an account shown as a lined note', 'desk') + '''
<h3>Writing an account as a note</h3>''' + fig('d_classic_edit', 'Note editor with plain text lines like Username: and Password:', 'desk', side=True) + '''
<h3>What Vaultleaf understands</h3>
<div class="table-wrap"><table><thead><tr><th scope="col">Write this</th><th scope="col">It becomes</th></tr></thead><tbody>
<tr><td>The first line</td><td>The name of the tool or service</td></tr>
<tr><td><code>Account: Family plan</code></td><td>Account name</td></tr>
<tr><td><code>Website:</code> or <code>URL:</code></td><td>Website, with an open button</td></tr>
<tr><td><code>Username:</code> <code>User:</code> <code>Login:</code></td><td>Username</td></tr>
<tr><td><code>Email:</code></td><td>Email</td></tr>
<tr><td><code>Password:</code> <code>Pass:</code> <code>Pwd:</code></td><td>Password, hidden</td></tr>
<tr><td><code>PIN:</code> <code>API key:</code> <code>Token:</code> <code>Secret phrase:</code> <code>CVV:</code></td><td>A hidden field of the right type</td></tr>
<tr><td><code>2FA:</code> followed by the setup key</td><td>A live 2FA code</td></tr>
<tr><td><code>Q:</code> then <code>A:</code> on the next line</td><td>Security question and hidden answer</td></tr>
<tr><td><code>Admin: Dana Ruiz &lt;dana@acme.com&gt; (Owner)</code></td><td>An admin with name, email and role</td></tr>
<tr><td><code>Labels: Work/Cloud, Personal</code></td><td>Labels; the slash makes a sub-label</td></tr>
<tr><td><code>Change every: 90 days</code></td><td>Password reminder</td></tr>
<tr><td><code>Notes:</code></td><td>Everything after it, kept exactly as written</td></tr>
<tr><td>Anything else, like <code>Network: Home-5G</code></td><td>Its own field, in the order you wrote it</td></tr>
</tbody></table></div>
<div class="pair">''' + ''.join(shot('p_note', 'A classic note on a phone with hidden password dots', 'phone')) + '''</div>''',
 'Classic looks and works like the notes you keep passwords in now. Modern shows cards with copy buttons. Switch any time with the two icons above the list. Both show the same accounts.'))

body.append(sec('add', 'Add and edit accounts', fig('d_templates', 'Add an account menu with templates', 'desk', side=True) + '<h3>The form editor</h3>' + fig('d_editor', 'Form editor with name, account name, date stored and password fields', 'desk', side=True) +
 fig('d_editor2', 'Add a field buttons, security questions and an admin row', 'desk', side=True) + fig('d_editor3', 'Labels, new label field and reminder in the editor', 'desk', side=True) +
 '<h3>More actions</h3>' + fig('d_more', 'Menu with edit as note, duplicate and delete', 'desk', side=True),
 'Press Add, pick what kind of account it is, and fill in what you have. Every field except the name is optional.'))

body.append(sec('import', 'Bring over your notes', fig('d_import', 'Import from Notes window with pasted text and a preview of two accounts', 'desk', side=True) + '''
<ol class="howto"><li>In your notes app, open a note, select all, and copy.</li><li>In Vaultleaf, go to <b>Settings</b> and choose <b>Import from Notes</b>, or use it from the Add menu.</li><li>Paste. To bring many at once, put a line with <code>---</code> between notes.</li><li>Check the preview, then press <b>Import</b>. Each note becomes an account labeled Imported.</li></ol>
<p>Coming from a browser or another password manager? Export a CSV file from it, then use <b>Import a CSV file</b> in Settings. Chrome, Safari, Bitwarden, 1Password and LastPass exports all work. Delete the CSV afterwards, because it isn't encrypted.</p>''',
 'You don\'t have to retype anything. Vaultleaf reads notes written the way most people write them, with lines like "user:" and "pass:".'))

body.append(sec('labels', 'Labels and sub-labels', '<div class="duo">' + fig('d_label', 'New label window with name, parent and color', 'desk', side=False) + '</div>' + '''
<ul class="facts"><li><b>Create</b> from the sidebar (New label), from Settings, or while editing an account by typing a name like <code>Finance/Banks</code>.</li>
<li><b>Sub-labels</b> sit inside a parent. Picking the parent shows everything under it.</li>
<li><b>Search by label</b> by typing <kbd>#</kbd> and part of its name, like <kbd>#bank</kbd>.</li>
<li><b>Deleting</b> a label never deletes accounts. They just lose that label.</li></ul>''',
 'Labels work like folders, except an account can have several. In Classic view the sidebar calls them Folders.'))

body.append(sec('generator', 'Make strong passwords', fig('d_generator', 'Password generator with a 20-character password, strength rating and options', 'desk'),
 'The generator uses your device\'s secure random number source. Passphrases are picked from a list of 7,776 words.'))

body.append(sec('health', 'Check password health', fig('d_health', 'Password health page with a score of 67 and lists of weak and overdue passwords', 'desk') + '<div class="pair">' + shot('p_health', 'Password health on a phone', 'phone')[0] + '''<div><h3>What counts as a problem</h3><ul class="facts"><li><b>Weak:</b> rated Weak or Very weak, like a dictionary word with a year.</li><li><b>Reused:</b> the same password on more than one account.</li><li><b>Overdue:</b> past its reminder, or not changed in over a year.</li><li><b>No 2FA code:</b> a suggestion, not a problem. Turn on two-step sign-in where the site offers it.</li></ul></div></div>''',
 'Health looks at every saved password and points out the ones worth changing.'))

body.append(sec('activity', 'Activity and copy records', fig('d_activity', 'Activity page listing copies and changes with times', 'desk'),
 'Every copy and every change is recorded with the date and time, across all accounts.'))

body.append(sec('settings', 'Settings', fig('d_settings', 'Settings page: guide banner, your account, security options', 'desk') + '''
<div class="table-wrap"><table><thead><tr><th scope="col">Setting</th><th scope="col">What it does</th><th scope="col">Starts as</th></tr></thead><tbody>
<tr><td>Lock automatically</td><td>Locks after this long without activity</td><td>5 minutes</td></tr>
<tr><td>Lock when I leave the app</td><td>Locks if Vaultleaf has been in the background for over a minute</td><td>On</td></tr>
<tr><td>Hide shown secrets again</td><td>Hides a value you revealed</td><td>After 30 seconds</td></tr>
<tr><td>Clear copied secrets</td><td>Tries to empty the clipboard after you copy a secret. Some browsers don't allow it.</td><td>After 30 seconds</td></tr>
<tr><td>Default password reminder</td><td>Flags passwords older than this on the Health page</td><td>Off</td></tr>
<tr><td>View</td><td>Classic notes or Modern cards</td><td>Modern</td></tr>
<tr><td>Theme</td><td>Auto follows your device, or Light or Dark</td><td>Auto</td></tr>
</tbody></table></div>''' + fig('d_settings2', 'Settings: backup, restore, import and export rows', 'desk') + fig('d_settings3', 'Settings: appearance and the labels list', 'desk') +
 '<h3>Changing your password or passcode</h3>' + fig('d_chpw', 'Change master password window', 'desk', side=True) +
 '<h3>Dark theme</h3>' + shot('d_dark', 'Vaultleaf in the dark theme showing an account with admins and a 2FA code', 'desk')[0],
 'Settings is where you update your login, choose how Vaultleaf locks, and back up.'))

body.append(sec('backup', 'Backups and new devices', fig('d_backup', 'Encrypted backup window with Download and Copy buttons', 'desk', side=True) + fig('d_restore', 'Restore from backup window', 'desk', side=True) + '''
<h3>Move to a new phone or computer</h3>
<ol class="howto"><li>On the old device: <b>Settings</b>, then <b>Back up</b>, then <b>Download file</b> (or Copy backup text).</li><li>Get the file to the new device by AirDrop, email to yourself, or a cloud drive. It's encrypted, so that's safe.</li><li>On the new device, open Vaultleaf and choose <b>Restore from a backup file</b> on the first screen.</li><li>Pick the file and enter the password and passcode you had when you made it. Your vault opens.</li></ol>
<div class="callout"><b>Back up after big changes,</b> and at least monthly. Settings shows the date of your last backup. A vault lives in one browser on one device, so a backup is what protects you if that browser's data is cleared or the device is lost.</div>
<h3>Deleting and getting things back</h3>''' + shot('d_trash', 'Recently deleted with Restore and Delete forever buttons', 'desk')[0] + shot('d_trash', '', 'desk')[1],
 'Your vault is saved in this browser. A backup file is your copy for safekeeping and for moving to another device.'))

body.append(sec('phone', 'Put it on your home screen', '''
<div class="cols2"><div><h3>iPhone or iPad</h3><ol class="howto"><li>Open Vaultleaf in Safari.</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>From now on, open Vaultleaf from its icon.</li></ol></div>
<div><h3>Android</h3><ol class="howto"><li>Open Vaultleaf in Chrome.</li><li>Tap the menu (three dots).</li><li>Choose <b>Add to Home screen</b> or <b>Install app</b>.</li><li>Open it from the new icon.</li></ol></div></div>
<div class="callout warn"><b>On iPhone, use the home-screen icon.</b> Safari can clear a website's saved data if you haven't opened it for a week of browsing. Apps added to the home screen are kept. Either way, keep a recent backup.</div>
<p>After the first visit, Vaultleaf also opens without an internet connection.</p>''',
 'Installed this way, Vaultleaf opens full screen like an app, works offline, and keeps its data more reliably.'))

body.append(sec('security', 'How your data is protected', '''
<div class="flow" role="img" aria-label="Your master password and passcode together make a key. That key unlocks the vault key, which encrypts your vault. The recovery key can also unlock the vault key. The encrypted vault is stored in this browser and in your backup files.">
  <div class="fl-col"><div class="node you">Master password</div><div class="plus">+</div><div class="node you">Passcode</div></div>
  <div class="arrow"><span>600,000 rounds of PBKDF2</span></div>
  <div class="fl-col"><div class="node key">Unlock key</div><div class="node alt">Recovery key</div></div>
  <div class="arrow"><span>unlocks</span></div>
  <div class="fl-col"><div class="node key">Vault key</div></div>
  <div class="arrow"><span>AES-256-GCM</span></div>
  <div class="fl-col"><div class="node lock">Your encrypted vault</div><div class="tiny">Saved in this browser and in your backup files</div></div>
</div>
<ul class="facts">
<li><b>Encrypted before it's saved.</b> Every change is encrypted on your device before it's written to storage.</li>
<li><b>Your password and passcode never leave your device.</b> They aren't stored anywhere, even in scrambled form.</li>
<li><b>No outside services.</b> Vaultleaf loads nothing from other websites and sends nothing anywhere. The page blocks outside scripts on purpose.</li>
<li><b>Nobody can reset it.</b> Not your admin, not Vercel, not GitHub. That's what keeps it private, and it's why the recovery key matters.</li>
<li><b>Backups are encrypted the same way.</b> Only the CSV export is readable, so delete it after use.</li>
</ul>
<p class="note">Vaultleaf uses the standard encryption built into your browser. It hasn't been independently audited the way large commercial password managers have.</p>''',
 'In plain terms: Vaultleaf scrambles your data with a key only you can make.'))

body.append(sec('admins', 'For admins', '''
<div class="cards">
<div class="card-a"><h3>Control who can open the site</h3><p>In Vercel, open the <b>mco-vault-leaf</b> project, then <b>Settings</b>, then <b>Deployment Protection</b>.</p><ul class="facts"><li><b>Vercel Authentication on</b> (the current setting): only people logged in to your Vercel team can open the site. This is the most private option for a personal vault.</li><li><b>Off:</b> anyone with the link can open it. Each person still gets an empty, private vault in their own browser, and can't see anyone else's.</li></ul></div>
<div class="card-a"><h3>Publish an update</h3><p>Changes to the <code>vault-leaf</code> folder on the <code>main</code> branch of the <b>c3jumpw/mco</b> repository deploy automatically.</p><ul class="facts"><li>People get the new version the next time they open Vaultleaf online. Their saved data is untouched.</li><li>If an update misbehaves, use <b>Instant Rollback</b> on the project's Vercel page.</li></ul></div>
<div class="card-a"><h3>Keep the web address</h3><p>Each vault belongs to one web address in one browser. If you move Vaultleaf to a custom domain, everyone needs to back up on the old address first and restore on the new one.</p></div>
<div class="card-a"><h3>Help someone who's locked out</h3><ul class="facts"><li>Forgot password or passcode: they use their recovery key on the unlock screen.</li><li>Lost the key too, but remember the password and passcode: they make a new key in Settings.</li><li>New or lost device: they restore their latest backup file.</li><li>Without any of these, the vault can't be opened. You have no way to reset it.</li></ul></div>
<div class="card-a"><h3>Keep it private</h3><ul class="facts"><li>Leave Vercel Web Analytics and Speed Insights off. The site blocks outside scripts on purpose.</li><li>Security headers live in <code>vault-leaf/vercel.json</code>. Keep them when you edit.</li><li>The site asks search engines not to list it.</li></ul></div>
</div>''',
 'Admins look after the website itself. Everything inside a vault stays with its owner.'))

body.append(sec('shortcuts', 'Keyboard shortcuts', '''
<div class="table-wrap"><table><thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead><tbody>
<tr><td><kbd>/</kbd></td><td>Jump to search</td></tr><tr><td><kbd>N</kbd></td><td>Add an account</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Close a window, cancel editing, or go back to the list on a phone</td></tr>
<tr><td><kbd>Enter</kbd> or <kbd>Space</kbd></td><td>Open or copy the focused row</td></tr>
<tr><td><kbd>0</kbd> to <kbd>9</kbd>, <kbd>Backspace</kbd></td><td>Type your passcode on the keypad screen</td></tr></tbody></table></div>'''))

body.append(sec('faq', 'Troubleshooting', ''.join(f'<details class="qa"><summary>{q}</summary><div>{a}</div></details>' for q, a in [
 ('I forgot my master password or passcode.', 'On the unlock screen choose <b>Forgot your password or passcode?</b>, enter your recovery key, and pick new ones.'),
 ('I lost my recovery key.', 'If you can still unlock, go to <b>Settings</b> and choose <b>New recovery key</b>, then save it. If you can\'t unlock and don\'t have the key, the vault can\'t be opened by anyone. Restore a backup if you have one, using the password and passcode from when you made it.'),
 ('It says "Too many tries".', 'After 5 wrong tries you must wait before trying again. The wait starts at 30 seconds and doubles up to 15 minutes. Check Caps Lock, then try again when the timer ends.'),
 ('My accounts are gone.', 'Check you\'re on the same device, browser and web address you set up on. Each is a separate vault. If the browser\'s data was cleared, restore your latest backup.'),
 ('Copy doesn\'t work.', 'Some browsers block copying in certain cases. Tap the eye to show the value and copy it by hand. On iPhone, use Safari or the home-screen icon.'),
 ('It locked while I was using it.', 'Auto-lock starts after 5 minutes without taps or typing. Change it in <b>Settings</b>, under Lock automatically.'),
 ('Can I use it without internet?', 'Yes, after you\'ve opened it once online. Everything you do works offline.'),
 ('Is it safe to email myself a backup?', 'Yes. The backup is encrypted and opens only with your password and passcode or recovery key. The CSV export is different: it isn\'t encrypted.'),
])))

TOC = ''.join(f'<li><a href="#{i}">{t}</a></li>' for i, t in SECTIONS)
CSS = (ROOT / 'guide' / 'guide.css').read_text() if (ROOT / 'guide' / 'guide.css').exists() else ''
d_main = M['d_main']; p_list = M['p_list']
page = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vaultleaf guide</title><meta name="robots" content="noindex, nofollow"><meta name="description" content="How to use Vaultleaf, with pictures of every screen.">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/guide/guide.css">
</head><body>
<header class="top"><a class="brand" href="#top" aria-label="Vaultleaf guide, back to top"><svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><path class="leafbody" d="M6 42C6 20 20 6 42 6c0 22-14 36-36 36z"/><path class="hole" d="M24 14.5a4.6 4.6 0 0 1 2.7 8.3l1.6 8.7h-8.6l1.6-8.7A4.6 4.6 0 0 1 24 14.5z"/></svg><span>Vaultleaf <em>guide</em></span></a>
<a class="open" href="/" target="_blank" rel="noopener">Open Vaultleaf</a></header>
<div class="layout" id="top">
<nav class="toc" aria-label="Contents"><details class="toc-m"><summary>Contents</summary><ul>{TOC}</ul></details><div class="toc-d"><p>Contents</p><ul>{TOC}</ul></div></nav>
<main>
<section class="hero"><h1>How to use Vaultleaf</h1>
<p class="lead">Vaultleaf keeps your passwords, keys, secret phrases and account details encrypted on your own device. Read accounts like your old notes, or as cards you can search and copy from. This guide shows every screen, with numbered callouts that match the notes beside each picture.</p>
<div class="hero-art"><figure class="shot desk"><div class="frame"><img src="/guide/img/d_main.webp" width="{d_main["w"]}" height="{d_main["h"]}" alt="Vaultleaf on a computer showing the account list and an open account"></div></figure>
<figure class="shot phone over"><div class="frame"><img src="/guide/img/p_list.webp" width="{p_list["w"]}" height="{p_list["h"]}" alt="Vaultleaf on a phone"></div></figure></div>
<div class="quick-links"><a href="#start">Set up</a><a href="#tour">Find your way around</a><a href="#views">Classic notes view</a><a href="#backup">Back up</a><a href="#admins">For admins</a></div>
</section>
{''.join(body)}
<footer class="foot"><p>Vaultleaf guide, updated {UPDATED}. Fonts: Bricolage Grotesque and Atkinson Hyperlegible (SIL Open Font License). Passphrase words: EFF long wordlist (CC BY 3.0).</p></footer>
</main></div></body></html>'''
(ROOT / 'guide' / 'index.html').write_text(page)
print('guide', len(page), 'sections', len(SECTIONS))
