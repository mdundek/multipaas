#!/bin/bash

export LC_ALL="en_US.UTF-8"
export LANG="en_US.UTF-8"
export LANGUAGE="en_US.UTF-8"

########################################
# LOG HELPER FUNCTIONS
########################################
log() {
    printf -- "\033[37m$1\033[0m";
}
lognl() {
    printf -- "\033[37m$1\n\033[0m";
}

dim() {
    printf -- "\033[1;34m$1\033[0m";
}
dimnl() {
    printf -- "\033[1;33m$1\n\033[0m";
}

success() {
    printf -- "\033[32m$1\033[0m";
}
successnl() {
    printf -- "\033[32m$1\n\033[0m";
}

error() {
    printf -- "\033[31m$1\033[0m";
}
errornl() {
    printf -- "\033[31m$1\n\033[0m";
}

warn() {
    printf -- "\033[33m$1\033[0m";
}
warnnl() {
    printf -- "\033[33m$1\n\033[0m";
}

########################################
# 
########################################
escape_slashes() {
    sed 's/\//\\\//g' 
}

yes_no() {
    local  __resultvar=$2
    read_input "$1 (y/n)?" _R
    while [ "$_R" != 'y' ] && [ "$_R" != 'n' ]; do
        read_input "Invalide answer, try again (y/n):" _R
    done
    eval $__resultvar="'$_R'"
}

########################################
# 
########################################
change_line() {
    local OLD_LINE_PATTERN=$1; shift
    local NEW_LINE=$1; shift
    local FILE=$1

    local NEW=$(echo "${NEW_LINE}" | escape_slashes)
    sed -i .bak '/'"${OLD_LINE_PATTERN}"'/s/.*/'"${NEW}"'/' "${FILE}"
    mv "${FILE}.bak" /tmp/
}

########################################
# 
########################################
read_input() {
    local  __resultvar=$2
    local _VAL
    success "$1 "
    read _VAL
    if [[ "$__resultvar" ]]; then
        eval $__resultvar="'$_VAL'"
    else
        echo "$_VAL"
    fi
}

########################################
# 
########################################
log_sanitizer() {
    while read IN
    do
        dim "$(echo "$IN" | perl -pe 's/\x1b\[[0-9;]*[mG]//g')\n"
    done
}

########################################
# 
########################################
log_error_sanitizer() {
    while read IN
    do
        LWC=$(echo "$IN" | awk '{print tolower($0)}')
        if [[ $LWC == *"error"* ]]; then
            if [[ $LWC == *"nothing to do"* ]]; then
                dim "."
            elif [[ $1 != "skip-errors" ]]; then
                error "\n$(echo "$IN" | perl -pe 's/\x1b\[[0-9;]*[mG]//g')\n"
            fi
        else
            dim "."
        fi
    done
}

########################################
# 
########################################
bussy_indicator() {
    if [[ -n "$2" ]]; then
        __resultvar=$2
    fi

    local pid=$!
    local spin='-\|/'
    local _i=0
    while kill -0 $pid 2>/dev/null
    do
        _i=$(( (_i+1) %4 ))
        printf "\r\033[1;33m$1\033[0m${spin:$_i:1}"
        sleep .1
    done
    wait $pid
    _CODE=$?
    if [ $_CODE == 0 ]; then
        printf "\r\033[1;33m$1\033[0mDone"
    else
        printf "\r\033[1;33m$1\033[0m\033[31mError\033[0m"
        log "\n"
        exit 1
    fi
    if [[ -n "$2" ]]; then
        eval $__resultvar="'$_CODE'"
    fi
}

########################################
# 
########################################
log_percent() {
    TOTAL_EXPECTED=$1
    CURRENT_COUNT=0
    while read IN
    do
        CURRENT_COUNT=$[$CURRENT_COUNT+1]
        PERCENT=$((($CURRENT_COUNT*100)/$TOTAL_EXPECTED))
        if [ $PERCENT -gt 100 ]; then
            PERCENT=100
        fi
        echo -ne " $PERCENT/100% \r"
    done
    echo " 100"
}

########################################
# 
########################################
combo_index() {
    local  __resultvar=$1
    shift
    local title="$1"
    shift 
    local question="$1"
    shift 
    log "$title\n\n"
    local arr=("$@")
    local arrLength="${#arr[@]}"
    local RESP
    _I=1
    for VAL in "${arr[@]}"; do :
        dim "  $_I) $VAL\n"
        _I=$(($_I+1))
    done
    log "\n"
    read_input "$question" RESP
    while [[ "$RESP" -gt "$arrLength" ]] || [[ "$RESP" -lt "1" ]]; do
        read_input "Invalide answer, try again:" RESP
    done
    eval $__resultvar="'$(($RESP-1))'"
}

########################################
# 
########################################
combo_value() {
    local  __resultvar=$1
    shift
    local title="$1"
    shift 
    local question="$1"
    shift 
    log "$title\n\n"
    local arr=("$@")
    local arrLength="${#arr[@]}"
    local RESP
    _I=1
    for VAL in "${arr[@]}"; do :
        dim "  $_I) $VAL\n"
        _I=$(($_I+1))
    done
    log "\n"
    read_input "$question" RESP
    while [[ "$RESP" -gt "$arrLength" ]] || [[ "$RESP" -lt "1" ]]; do
        read_input "Invalide answer, try again:" RESP
    done
    local _FR="${arr[$(($RESP-1))]}"
    eval $__resultvar="'$_FR'"
}

########################################
# 
########################################
get_network_interface_ip() {
    local  __resultvarIFACE=$1
    local  __resultvarIP=$2

    if [ "$DISTRO" == "ubuntu" ]; then
        IFACES=$(ifconfig | cut -d ' ' -f1 | tr ':' '\n' | awk NF)
        readarray -t IFACESarrIN <<<"$IFACES"
    elif [ "$DISTRO" == "redhat" ]; then
        IFACES=$(nmcli device status | cut -d ' ' -f1)
        readarray -t _IFACESarrIN <<<"$IFACES"
        IFACESarrIN=("${_IFACESarrIN[@]:1}")
    fi

    LOCAL_IPS="$(hostname -I)"
    LOCAL_IPSarrIN=(${LOCAL_IPS// / })

    FINAL_IPS_IFACES=()
    FINAL_IPS=()
    FINAL_IFACES=()
    for iface in "${IFACESarrIN[@]}"; do :
        HAS_IP=$(ip addr show $iface 2> /dev/null)
        if [ "$HAS_IP" != "" ]; then
            for ip in "${LOCAL_IPSarrIN[@]}"; do :
                IP_MATCH=$(ip addr show $iface | grep $ip)
                if [ "$IP_MATCH" != "" ]; then
                    FINAL_IPS+=("$ip")
                    FINAL_IFACES+=("$iface")
                    FINAL_IPS_IFACES+=("$iface ($ip)")
                fi
            done
        fi
    done
    log "\n"
    combo_index IFACE_IP_INDEX "Which LAN network interface should be used" "Your interface choice #:" "${FINAL_IPS_IFACES[@]}"

    eval $__resultvarIFACE="'${FINAL_IFACES[$IFACE_IP_INDEX]}'"
    eval $__resultvarIP="'${FINAL_IPS[$IFACE_IP_INDEX]}'"
}

########################################
# 
########################################
set_vagrant_network_interface() {
    change_line "$1.vm.network \"public_network\"" "    $1.vm.network \"public_network\", bridge: \"$2\"" ./Vagrantfile
}

########################################
# 
########################################
print_color_pallet() {
    T='gYw'
    echo -e "\n                 40m     41m     42m     43m\
        44m     45m     46m     47m";
    for FGs in '    m' '   1m' '  30m' '1;30m' '  31m' '1;31m' '  32m' \
            '1;32m' '  33m' '1;33m' '  34m' '1;34m' '  35m' '1;35m' \
            '  36m' '1;36m' '  37m' '1;37m';
        do FG=${FGs// /}
        echo -en " $FGs \033[$FG  $T  "
        for BG in 40m 41m 42m 43m 44m 45m 46m 47m;
            do echo -en "$EINS \033[$FG\033[$BG  $T  \033[0m";
        done
        echo;
    done
}

########################################
# 
########################################
far() {
    find $1 -name "$2" -exec sed -i "s/$3/$4/g" {} +
}