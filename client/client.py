#!/usr/bin/env python

import os
import sys
import shutil
import tempfile
import os.path
import subprocess
import random

def setup_profile(server_url, run_key):
    client_path = os.path.dirname(os.path.realpath(__file__))
    extension_path = os.path.realpath(os.path.join(client_path, '..', 'extension'))

    profile_path = tempfile.mkdtemp(prefix='endurance-profile')

    prof_ext_dir_path = os.path.join(profile_path, 'extensions')
    os.mkdir(prof_ext_dir_path)

    prof_ext_path = os.path.join(prof_ext_dir_path, 'endurance-test@mozilla.com')
    with open(prof_ext_path, 'w') as f:
        f.write(extension_path)

    user_js_path = os.path.join(profile_path, 'user.js')
    with open(user_js_path, 'w') as f:
        print >>f, 'user_pref("xpinstall.signatures.required", false);'
        print >>f, 'user_pref("extensions.autoDisableScopes", 14);'
        print >>f, 'user_pref("endurance.autostart", true);'
        print >>f, 'user_pref("endurance.serverUrl", "%s");' % server_url
        print >>f, 'user_pref("endurance.runKey", "%s");' % run_key

    return profile_path

fx_path = sys.argv[1]
if len(sys.argv) >= 3:
    server_url = sys.argv[2]
else:
    server_url = 'http://52.32.131.4'

while True:
    run_key = random.random()
    profile_path = setup_profile(server_url, run_key)

    p = subprocess.Popen([fx_path, '-no-remote', '-profile', profile_path])
    p.wait()

    shutil.rmtree(profile_path)
