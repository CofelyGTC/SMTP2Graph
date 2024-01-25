#/bin/bash
while true;
        do
        echo 'Starting SMTP2GRAPH'
        cd /etc/opt/smtp2graph
        node ./server.js
        sleep 5
        done