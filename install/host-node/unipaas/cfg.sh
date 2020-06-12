#!/bin/bash
rm -rf /etc/docker/certs.d/multipaas.registry.com:5000
mkdir -p /etc/docker/certs.d/multipaas.registry.com:5000
cat <<EOT >> /etc/docker/certs.d/multipaas.registry.com:5000/ca.crt
-----BEGIN CERTIFICATE-----
MIIEITCCAwmgAwIBAgIUeagWFD5HVatBk/w2AE0ES6o8ybcwDQYJKoZIhvcNAQEL
BQAwgZ8xCzAJBgNVBAYTAkZSMRAwDgYDVQQIDAdHYXJvbm5lMREwDwYDVQQHDAhU
b3Vsb3VzZTESMBAGA1UECgwJbXVsdGlwYWFzMQ4wDAYDVQQLDAVJVExBQjEfMB0G
A1UEAwwWbXVsdGlwYWFzLnJlZ2lzdHJ5LmNvbTEmMCQGCSqGSIb3DQEJARYXbXVs
dGlwYWFzQG11bHRpcGFhcy5jb20wHhcNMjAwNjExMTExMDA4WhcNMjEwNjExMTEx
MDA4WjCBnzELMAkGA1UEBhMCRlIxEDAOBgNVBAgMB0dhcm9ubmUxETAPBgNVBAcM
CFRvdWxvdXNlMRIwEAYDVQQKDAltdWx0aXBhYXMxDjAMBgNVBAsMBUlUTEFCMR8w
HQYDVQQDDBZtdWx0aXBhYXMucmVnaXN0cnkuY29tMSYwJAYJKoZIhvcNAQkBFhdt
dWx0aXBhYXNAbXVsdGlwYWFzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBANlodSi3WyFE2PqcWYJDm97uBreGy6wfGQlbj842mhyfVtLF02/sXuuz
AmJaBecVW9hPc6ZGcUfXxtHkLr0Dgc+uYyf40lr93mKiBJXZokvPS7pEC38URcjk
Q2GqyiHG7hBwAk4asyUGhPexo6qIJYw3r3qXLJ9aT5/6mNovVEjr7maG3AQ7FQ7j
vIH9QycQ9ynluXcbt9/hEO/CNugAGP0VXLulR75sX/70hQq9dX5m6L3h6Cjo3avW
ccoBgnf+1C3uMQXD55FpGhknsQDL2m0N3yTsCql1w1wIKj/OvonjZoifAkCQdvGA
02917HFYzeTzyEYBxvyAdd6f1Ca3Pj0CAwEAAaNTMFEwHQYDVR0OBBYEFH2NOXCC
2F7O9ewGGlII2tm+/RkRMB8GA1UdIwQYMBaAFH2NOXCC2F7O9ewGGlII2tm+/RkR
MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBADQZLLVHeT1ARJnp
318k4pzXYnFJSKrnV77EWsDt/t/ivGGKQK1z2SGu9fSv5PS2zYbsThFR2lOatew2
Qv73GZw37VvTQUiV7zAWxA181bB6meAYibIDzxBtLX87ULBKnIGWNQ+BmPCbLxzY
r4cLHjx7/ZT2+dblnXJosvg7Drww1eml7zssnlv1wc0n3AwjkV/UcYoxJU/OfPhU
spgpM8fmHCrtBibsokj30EimkejFAw8lGRDzha610kjFHj1ZkA5gn2MEspFgA57i
G0MLANCCyJc1Hmnfcp2tCU4khI0JHYrJE70bSaBdSZtx+p4tkvgKloniFBYpBhg/
TLevvQA=
-----END CERTIFICATE-----
EOT
rm -rf /etc/docker/certs.d/registry.multipaas.org
mkdir -p /etc/docker/certs.d/registry.multipaas.org
cat <<EOT >> /etc/docker/certs.d/registry.multipaas.org/ca.crt
-----BEGIN CERTIFICATE-----
MIIEITCCAwmgAwIBAgIUUVRnFkJy61q0V9CbNAGNP9aClO4wDQYJKoZIhvcNAQEL
BQAwgZ8xCzAJBgNVBAYTAkZSMRAwDgYDVQQIDAdHYXJvbm5lMREwDwYDVQQHDAhU
b3Vsb3VzZTESMBAGA1UECgwJbXVsdGlwYWFzMQ4wDAYDVQQLDAVJVExBQjEfMB0G
A1UEAwwWcmVnaXN0cnkubXVsdGlwYWFzLm9yZzEmMCQGCSqGSIb3DQEJARYXbXVs
dGlwYWFzQG11bHRpcGFhcy5jb20wHhcNMjAwNjExMTExMDA4WhcNMjEwNjExMTEx
MDA4WjCBnzELMAkGA1UEBhMCRlIxEDAOBgNVBAgMB0dhcm9ubmUxETAPBgNVBAcM
CFRvdWxvdXNlMRIwEAYDVQQKDAltdWx0aXBhYXMxDjAMBgNVBAsMBUlUTEFCMR8w
HQYDVQQDDBZyZWdpc3RyeS5tdWx0aXBhYXMub3JnMSYwJAYJKoZIhvcNAQkBFhdt
dWx0aXBhYXNAbXVsdGlwYWFzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBAMsBpVQVKJFBOrXkc8vWPMcLFxWR6HvRoKwqCTIhJu4Tb67DfBcCyJia
n33iAZdD8tuKroX/O5OkS5JQi5h26JWuxR94ecC3gsvFkloN/ZJIgeV3B34vfFtu
UzpP//Mv5C+pazGcWVIpL4bUXJpmWyWfwElkYevWn+TlHlG/FmCKi0fH50e94EBt
klv/WtvyXKPFdGAz0bThsqjnD2D9kTrO34TBuso5Mj/cmVbxVLj19CUbWtmyC5Ft
s0wQU1wdYV4waAtIS+nn1BE0V3ZzWMiQy411xr/CS2P1Jpog6/tGiFPQELGFo2qK
X3IicpiJXEtopLLurOZhjEeUmDJH9tsCAwEAAaNTMFEwHQYDVR0OBBYEFNMI7LZh
pVQc6nwA54c7cYzmN1whMB8GA1UdIwQYMBaAFNMI7LZhpVQc6nwA54c7cYzmN1wh
MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAGOryq5V/umpuSwy
8EKCI4VYfqxGt2lp66s0rG46NWHyne47JokMa28nme1Lpg9X8yutsmQbiVkM5Sj8
hv9WbsHDW25WvxqDquuFxxfJoJlxQD+V+x8ml1rY86ursJlqF1nP49M55HapINu4
MhglHNc9A+vFwKCAxiUBRJGRBPJkgWhP15gTKDh0KVlqBl9G/2/MNsQdxOf7PECy
0LjD+1s3fyf/LFIsLZgeUdVQFyo7F9UgWUQLIOOlxWhylpMZHEqL1XilSBZFZJZ1
DCfPCz78lKTiY9C/1LnAKtCCJqkauX15L+Xa9/GBHzlZRSlCEzTPxNsmkIUdIJFo
lWNHunw=
-----END CERTIFICATE-----
EOT
systemctl stop docker && systemctl start docker
