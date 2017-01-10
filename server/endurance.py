import os
from sqlite3 import dbapi2 as sqlite3
from flask import Flask, request, session, g, redirect, url_for, abort, \
     render_template, flash, send_from_directory, send_file, jsonify
import json
import uuid
import collections
import datetime

# create our little application :)
app = Flask(__name__)

# Load default config and override config from an environment variable
app.config.update(dict(
    DATABASE=os.path.join(app.root_path, 'endurance.db'),
    DEBUG=True,
    SECRET_KEY='development key',
    USERNAME='admin',
    PASSWORD='default',
    UPLOAD_FOLDER=os.path.join(app.root_path, 'uploaded_files')
))
app.config.from_envvar('ENDURANCE_SETTINGS', silent=True)


def connect_db():
    """Connects to the specific database."""
    rv = sqlite3.connect(app.config['DATABASE'])
    rv.row_factory = sqlite3.Row
    return rv


def init_db():
    """Initializes the database."""
    db = get_db()
    with app.open_resource('schema.sql', mode='r') as f:
        db.cursor().executescript(f.read())
    db.commit()


@app.cli.command('initdb')
def initdb_command():
    """Creates the database tables."""
    init_db()
    print('Initialized the database.')


def get_db():
    """Opens a new database connection if there is none yet for the
    current application context.
    """
    if not hasattr(g, 'sqlite_db'):
        g.sqlite_db = connect_db()
    return g.sqlite_db


@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    if hasattr(g, 'sqlite_db'):
        g.sqlite_db.close()


@app.route('/static/js/<path:path>')
def send_js(path):
    return send_from_directory('static/js', path)

@app.route('/static/css/<path:path>')
def send_css(path):
    return send_from_directory('static/css', path)

@app.route('/')
def show_runs():
    db = get_db()
    cur = db.execute('select distinct key from entries')
    all_keys = cur.fetchall()

    cur = db.execute('select key, start_date, ip, user_agent from runs order by datetime(start_date) desc')
    runs = cur.fetchall()

    return render_template('show_runs.html', all_keys=all_keys, runs=runs)

@app.route('/manual_submit')
def manual_submit():
    return render_template('manual_submit.html')

# Request has several fields:
@app.route('/submit', methods=['POST'])
def submit_entries():
    db = get_db()

    ip = str(request.remote_addr)
    user_agent = request.headers.get('User-Agent')
    run_key = request.form['run_key']
    start_date = request.form['start_date']
    data = json.loads(request.form['data'])

    cur = db.execute('select key from runs where key = ?', [run_key])
    entries = cur.fetchall()
    if not entries:
        db.execute('insert into runs (key, start_date, ip, user_agent) values (?, ?, ?, ?)',
                   [run_key, start_date, ip, user_agent])

    for (timestamp, k, v) in data:
        db.execute('insert into entries (run_key, timestamp, key, value) values (?, ?, ?, ?)',
                   [run_key, timestamp, k, v])

    db.commit()
    flash('New entry was successfully posted')
    return 'Success'

def is_plot_key(key):
    return not key.endswith('(file)') and not key.endswith('(text)')

Option = collections.namedtuple('Option', ['selector', 'key', 'run'])

@app.route('/show_data')
def show_data():
    db = get_db()

    keys = request.args.getlist("key")
    run_keys = request.args.getlist("run")

    cur = db.execute('select key, start_date, ip, user_agent from runs where key in (%s) order by datetime(start_date) desc' %
                      ','.join('?' * len(run_keys)),
                     run_keys)
    runs = cur.fetchall()

    options = []
    for run in runs:
        for key in keys:
            if not is_plot_key(key):
                continue
            sel = key + '/' + run['key']
            option = Option(selector=sel, key=key, run=run)
            options.append(option)

    text_keys = []
    for key in keys:
        if not is_plot_key(key):
            text_keys.append(key)

    cur = db.execute('select timestamp, run_key, key, value from entries where key in (%s) and run_key in (%s) order by timestamp' %
                     (','.join('?' * len(text_keys)), ','.join('?' * len(run_keys))),
                     text_keys + run_keys)
    text_entries = cur.fetchall()

    text = []
    for entry in text_entries:
        ts = datetime.datetime.fromtimestamp(entry['timestamp'] / 1000).isoformat(' ')
        text.append([ ts, entry['run_key'], entry['key'], entry['value'] ])

    return render_template('show_data.html', options=options, text_entries=json.dumps(text))

@app.route('/data')
def get_data():
    db = get_db()

    selector = request.args.get('selector')
    (key, run_key) = selector.split('/')

    cur = db.execute('select timestamp, value from entries where key = ? and run_key = ? order by timestamp',
                     [key, run_key])
    data = cur.fetchall()

    result = {'x': [], 'y': []}
    for d in data:
        ts = datetime.datetime.fromtimestamp(d['timestamp'] / 1000).isoformat(' ')
        result['x'].append(ts)
        result['y'].append(d['value'])

    return jsonify(**result)

@app.route('/file', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        # check if the post request has the file part
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)
        file = request.files['file']
        run_key = request.form['run_key']
        key = request.form['key']
        timestamp = request.form['timestamp']
        filename = uuid.uuid4().hex

        if file:
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            db = get_db()
            print 'Inserting', key
            db.execute('insert into entries (run_key, timestamp, key, value) values (?, ?, ?, ?)',
                       [run_key, timestamp, key, filename])
            db.commit()
            return 'Success'

    return '''
    <!doctype html>
    <title>Upload new File</title>
    <h1>Upload new File</h1>
    <form method="post" enctype="multipart/form-data">
      <p><input type="file" name="file">
         <input type="text" name="run_key">
         <input type="text" name="key">
         <input type="text" name="timestamp">
         <input type="submit" value="Upload">
    </form>
    '''

@app.route('/file/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'],
                               filename)
