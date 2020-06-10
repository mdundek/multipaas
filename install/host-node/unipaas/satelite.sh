#!/bin/bash

host="192.168.1.12"
node_ip="192.168.1.67"

# clean="output input cmds"
p="backpipe"
# pid=$(cat pidfile)

topic_pub="/unipaas/cmd/response/$node_ip"
topic_sub="/unipaas/cmd/request/$node_ip"

# ctrl_c() {
#   	echo "Cleaning up..."
# 	rm -f $p;rm "$clean";kill $pid 2>/dev/null
# 	if [[ "$?" -eq "0" ]]; then
# 		exit 0
# 	else
# 		exit 1
# 	fi
# }

listen(){



	mosquitto_sub -h $host -t $topic_sub |  
	while IFS= read -r line  
	do  
			echo $line 
	done  





	# ([ ! -p "$p" ]) && mkfifo $p
	# (mosquitto_sub -h $host -t $topic_sub >$p 2>/dev/null) &
	# echo "$!" > pidfile
	# while read line <$p
	# do
	# 	echo $line > cmds

	# 	(bash cmds | tee out) && mosquitto_pub -h $host -t $topic_pub -f out;>out

	# done
}

# usage(){
# 	echo "  UniPaaS Satelite"
# 	echo "  Usage: $0 <mqtt server>"
# }

# case "$1" in
# -h|--host)
# trap ctrl_c INT
listen
# ;;
# *)
# usage
# exit 1
# ;;
# esac