/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

 */
#include "dml_packet.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

int dml_packet_send_hello(struct dml_connection *dc, uint32_t flags, char *ident)
{
	uint8_t data[4 + strlen(ident)];
	
	data[0] = (flags >> 24) & 0xff;
	data[1] = (flags >> 16) & 0xff;
	data[2] = (flags >> 8) & 0xff;
	data[3] = (flags >> 0) & 0xff;
	
	memcpy(data + 4, ident, strlen(ident));
	
	return dml_connection_send(dc, data, DML_PACKET_HELLO, 4 + strlen(ident));
}

int dml_packet_parse_hello(uint8_t *data, uint16_t len, uint32_t *flags, char **ident)
{
	if (len < 4)
		return -1;
	
	if (flags)
		*flags = (data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3];
	
	if (ident) {
		*ident = malloc(len - 4 + 1);
		if (!*ident)
			return -1;
		(*ident)[len - 4] = 0;
		memcpy(*ident, data + 4, len - 4);
	}
	
	return 0;
}

int dml_packet_send_description(struct dml_connection *dc, 
    uint8_t id[DML_ID_SIZE], uint8_t version, uint32_t bps, char *mime, 
    char *name, char *alias, char *description)
{
	uint8_t data[DML_ID_SIZE + 1 + 4 + strlen(mime) + 1 +
	    strlen(name) + 1 + strlen(alias) + 1 + strlen(description) + 1];
	size_t pos = 0;

	if (version != DML_PACKET_DESCRIPTION_VERSION_0)
		return -1;

	memcpy(data, id, DML_ID_SIZE);
	pos += DML_ID_SIZE;
	
	data[pos] = version;
	pos++;
	
	data[pos + 0] = (bps >> 24) & 0xff;
	data[pos + 1] = (bps >> 16) & 0xff;
	data[pos + 2] = (bps >> 8) & 0xff;
	data[pos + 3] = (bps >> 0) & 0xff;
	pos += 4;
	
	strcpy((char *)data + pos, mime);
	pos += strlen(mime) + 1;

	strcpy((char *)data + pos, name);
	pos += strlen(name) + 1;
	
	strcpy((char *)data + pos, alias);
	pos += strlen(alias) + 1;
	
	strcpy((char *)data + pos, description);
	pos += strlen(description) + 1;
	
	return dml_connection_send(dc, data, DML_PACKET_DESCRIPTION, pos);
	
}

int dml_packet_parse_description(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *version, uint32_t *bps, char **mime,
    char **name, char **alias, char **description)
{
	size_t pos_mime, pos_name, pos_alias, pos_description;
	size_t size_mime, size_name, size_alias, size_description;
	
	if (len < (DML_ID_SIZE + 1 + 4))
		return -1;
	
	*version = data[DML_ID_SIZE];
	if (*version != DML_PACKET_DESCRIPTION_VERSION_0)
		return -1;

	memcpy(id, data, DML_ID_SIZE);
	
	*bps = 
	    (data[DML_ID_SIZE + 1] << 24) |
	    (data[DML_ID_SIZE + 2] << 16) |
	    (data[DML_ID_SIZE + 3] << 8) |
	    (data[DML_ID_SIZE + 4]);
	
	pos_mime = DML_ID_SIZE + 1 + 4;
	for (pos_name = pos_mime; pos_name < len && data[pos_name]; pos_name++);
	if (pos_name < len - 1)
		pos_name++;
	for (pos_alias = pos_name; pos_alias < len && data[pos_alias]; pos_alias++);
	if (pos_alias < len - 1)
		pos_alias++;
	for (pos_description = pos_alias; pos_description < len && data[pos_description]; pos_description++);
	if (pos_description < len - 1)
		pos_description++;
	
	size_mime = pos_name - pos_mime;
	size_name = pos_alias - pos_name;
	size_alias = pos_description - pos_alias;
	size_description = len - pos_description;
	
	if (mime) {
		*mime = malloc(size_mime);
		if (*mime) {
			memcpy(*mime, data + pos_mime, size_mime);
		}
	}
	if (name) {
		*name = malloc(size_name);
		if (*name) {
			memcpy(*name, data + pos_name, size_name);
		}
	}
	if (alias) {
		*alias = malloc(size_alias);
		if (*alias) {
			memcpy(*alias, data + pos_alias, size_alias);
		}
	}
	if (description) {
		*description = malloc(size_description);
		if (*description) {
			memcpy(*description, data + pos_description, size_description);
		}
	}
	
	return 0;
}

int dml_packet_send_route(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t hops)
{
	uint8_t data[DML_ID_SIZE + 1];

	memcpy(data, id, DML_ID_SIZE);
	data[DML_ID_SIZE] = hops;

	return dml_connection_send(dc, data, DML_PACKET_ROUTE, sizeof(data));
}

int dml_packet_parse_route(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *hops)
{
	if (len < DML_ID_SIZE + 1)
		return -1;
	
	memcpy(id, data, DML_ID_SIZE);
	if (hops)
		*hops = data[DML_ID_SIZE];
	
	return 0;
}

int dml_packet_send_req_description(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE])
{
	return dml_connection_send(dc, id_req, DML_PACKET_REQ_DESCRIPTION, DML_ID_SIZE);
}

int dml_packet_parse_req_description(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE])
{
	if (len < DML_ID_SIZE)
		return -1;
	
	memcpy(id_req, data, DML_ID_SIZE);
	return 0;
}

int dml_packet_send_req_certificate(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE])
{
	return dml_connection_send(dc, id_req, DML_PACKET_REQ_CERTIFICATE, DML_ID_SIZE);
}

int dml_packet_parse_req_certificate(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE])
{
	if (len < DML_ID_SIZE)
		return -1;
	
	memcpy(id_req, data, DML_ID_SIZE);
	return 0;
}

int dml_packet_send_req_header(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE])
{
	return dml_connection_send(dc, id_req, DML_PACKET_REQ_HEADER, DML_ID_SIZE);
}

int dml_packet_parse_req_header(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE])
{
	if (len < DML_ID_SIZE)
		return -1;
	
	memcpy(id_req, data, DML_ID_SIZE);
	return 0;
}

int dml_packet_send_certificate(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], void *data, size_t len)
{
	uint8_t payload[DML_ID_SIZE + len];
	
	memcpy(payload, id, DML_ID_SIZE);
	memcpy(payload + DML_ID_SIZE, data, len);
	
	return dml_connection_send(dc, payload, DML_PACKET_CERTIFICATE, DML_ID_SIZE + len);
}

int dml_packet_parse_certificate(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], void **cert_data, size_t *cert_len)
{
	uint8_t *data8 = data;
	size_t plen;
	
	if (len < DML_ID_SIZE)
		return -1;

	plen = len - DML_ID_SIZE;
	memcpy(id, data, DML_ID_SIZE);
	
	*cert_len = plen;
	*cert_data = malloc(plen);
	if (*cert_data) {
		memcpy(*cert_data, data8 + DML_ID_SIZE, plen);
		return 0;
	}
	return -1;
}

int dml_packet_send_header(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void *data, size_t len)
{
	uint8_t payload[DML_ID_SIZE + DML_SIG_SIZE + len];
	
	memcpy(payload, id, DML_ID_SIZE);
	memcpy(payload + DML_ID_SIZE, data, len);
	memcpy(payload + DML_ID_SIZE + len, sig, DML_SIG_SIZE);
	
	return dml_connection_send(dc, payload, DML_PACKET_HEADER, DML_ID_SIZE + DML_SIG_SIZE + len);
}

int dml_packet_parse_header(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void **header_data, size_t *header_len)
{
	uint8_t *data8 = data;
	size_t plen;
	
	if (len < DML_ID_SIZE + DML_SIG_SIZE)
		return -1;

	plen = len - DML_ID_SIZE - DML_SIG_SIZE;
	memcpy(id, data, DML_ID_SIZE);
	memcpy(sig, data8 + DML_ID_SIZE + plen, DML_SIG_SIZE);
	
	*header_len = plen;
	*header_data = malloc(plen);
	if (*header_data) {
		memcpy(*header_data, data8 + DML_ID_SIZE, plen);
		return 0;
	}
	return -1;
}

int dml_packet_send_connect(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint16_t packet_id)
{
	uint8_t payload[DML_ID_SIZE + 2];
	
	memcpy(payload, id, DML_ID_SIZE);
	payload[DML_ID_SIZE + 0] = (packet_id >> 8) & 0xff;
	payload[DML_ID_SIZE + 1] = packet_id & 0xff;
	
	return dml_connection_send(dc, payload, DML_PACKET_CONNECT, DML_ID_SIZE + 2);
}

int dml_packet_parse_connect(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint16_t *packet_id)
{
	if (len < DML_ID_SIZE + 2)
		return -1;
	
	memcpy(id, data, DML_ID_SIZE);
	*packet_id = (data[DML_ID_SIZE + 0] << 8) | data[DML_ID_SIZE + 1];
	
	return 0;
}

int dml_packet_send_disc(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t reason)
{
	uint8_t payload[DML_ID_SIZE + 1];
	
	memcpy(payload, id, DML_ID_SIZE);
	payload[DML_ID_SIZE] = reason;
	
	return dml_connection_send(dc, payload, DML_PACKET_DISC, DML_ID_SIZE + 1);
}

int dml_packet_parse_disc(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *reason)
{
	if (len < DML_ID_SIZE + 1)
		return -1;
	
	memcpy(id, data, DML_ID_SIZE);
	*reason = data[DML_ID_SIZE + 0];
	
	return 0;
}

int dml_packet_send_req_disc(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE])
{
	return dml_connection_send(dc, id, DML_PACKET_REQ_DISC, DML_ID_SIZE);
}

int dml_packet_parse_req_disc(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE])
{
	if (len < DML_ID_SIZE)
		return -1;
	
	memcpy(id, data, DML_ID_SIZE);
	
	return 0;
}

int dml_packet_send_req_reverse(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t rev_id[DML_ID_SIZE], uint8_t action)
{
	uint8_t payload[DML_ID_SIZE + DML_ID_SIZE + 1];
	
	memcpy(payload, id, DML_ID_SIZE);
	memcpy(payload + DML_ID_SIZE, rev_id, DML_ID_SIZE);
	payload[DML_ID_SIZE + DML_ID_SIZE] = action;

	return dml_connection_send(dc, payload, DML_PACKET_REQ_REVERSE, DML_ID_SIZE + DML_ID_SIZE + 1);
}

int dml_packet_parse_req_reverse(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t rev_id[DML_ID_SIZE], uint8_t *action)
{
	if (len < DML_ID_SIZE + DML_ID_SIZE + 1)
		return -1;
	
	memcpy(id, data, DML_ID_SIZE);
	memcpy(rev_id, data + DML_ID_SIZE, DML_ID_SIZE);
	*action = data[DML_ID_SIZE + DML_ID_SIZE];
	
	return 0;
}

int dml_packet_send_data(struct dml_connection *dc,
    uint16_t packet_id, void *data, size_t len, uint64_t timestamp,
    struct dml_crypto_key *dk)
{
	uint8_t payload[len + DML_SIG_SIZE + sizeof(uint64_t)];
	
	memcpy(payload, data, len);
	payload[len + 0] = (timestamp >> 56) & 0xff;
	payload[len + 1] = (timestamp >> 48) & 0xff;
	payload[len + 2] = (timestamp >> 40) & 0xff;
	payload[len + 3] = (timestamp >> 32) & 0xff;
	payload[len + 4] = (timestamp >> 24) & 0xff;
	payload[len + 5] = (timestamp >> 16) & 0xff;
	payload[len + 6] = (timestamp >> 8) & 0xff;
	payload[len + 7] = (timestamp) & 0xff;

	dml_crypto_sign(payload + len + sizeof(uint64_t),
	    payload, len + sizeof(uint64_t), dk);
	
	return dml_connection_send(dc, payload, packet_id, len + DML_SIG_SIZE + sizeof(uint64_t));;
}

int dml_packet_parse_data(uint8_t *data, uint16_t len,
    void **payload_data, size_t *payload_len, uint64_t *timestamp,
    struct dml_crypto_key *dk)
{
	if (len < DML_SIG_SIZE + sizeof(uint64_t))
		return -1;
	
	size_t plen = len - DML_SIG_SIZE - sizeof(uint64_t);
	*payload_len = plen;
	fprintf(stderr, "payload len: %zd\n", plen);

	bool verified = dml_crypto_verify(data, plen + sizeof(uint64_t),
	    data + plen + sizeof(uint64_t), dk);

	*payload_data = malloc(plen);
	if (!*payload_data)
		return -1;
	memcpy(*payload_data, data, plen);

	*timestamp = 
	    ((uint64_t)data[plen + 0] << 56) |
	    ((uint64_t)data[plen + 1] << 48) |
	    ((uint64_t)data[plen + 2] << 40) |
	    ((uint64_t)data[plen + 3] << 32) |
	    ((uint64_t)data[plen + 4] << 24) |
	    ((uint64_t)data[plen + 5] << 16) |
	    ((uint64_t)data[plen + 6] << 8) |
	    ((uint64_t)data[plen + 7]);
	
	if (!verified) {
		fprintf(stderr, "invalid signature\n");
		return -1;
	}

	return 0;
}
