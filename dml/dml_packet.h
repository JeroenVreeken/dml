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
#ifndef _DML_PACKET_H_
#define _DML_PACKET_H_

#include <stdlib.h>

#include "dml_connection.h"
#include "dml_crypto.h"
#include "dml.h"

#define DML_PACKET_SIZE_MAX	65536
/* Header: 16bit id, 16bit data length => 4 bytes */
#define DML_PACKET_HEADER_SIZE	4

#define DML_PACKET_HELLO_LEAF		1
#define DML_PACKET_HELLO_UPDATES	2

#define DML_PACKET_UPDATE_INITIAL_DONE	1

#define DML_PACKET_DISC_UNROUTABLE	1
#define DML_PACKET_DISC_REQUESTED	2

#define DML_PACKET_REQ_REVERSE_CONNECT	1
#define DML_PACKET_REQ_REVERSE_DISC	2

#define DML_PACKET_DESCRIPTION_VERSION_0	0 	/* 256b ECDSA (64B signature) */

enum dml_packet_id {
	DML_PACKET_HELLO = 0,
	DML_PACKET_ROUTE = 1,
	DML_PACKET_DESCRIPTION = 2,
	DML_PACKET_CERTIFICATE = 3,
	DML_PACKET_HEADER = 4,
	DML_PACKET_CONNECT = 5,
	DML_PACKET_DISC = 6,
	DML_PACKET_UPDATE = 7,
	
	DML_PACKET_REQ_DESCRIPTION = 34,
	DML_PACKET_REQ_CERTIFICATE = 35,
	DML_PACKET_REQ_HEADER = 36,
	DML_PACKET_REQ_REVERSE = 37,
	DML_PACKET_REQ_DISC = 38,
	
	/* IDs from here on are used with data */
	DML_PACKET_DATA = 4096,
};

int dml_packet_send_hello(struct dml_connection *dc, uint32_t flags, char *ident);
int dml_packet_parse_hello(uint8_t *data, uint16_t len, uint32_t *flags, char **ident);

int dml_packet_send_update(struct dml_connection *dc, uint32_t flags);
int dml_packet_parse_update(uint8_t *data, uint16_t len, uint32_t *flags);

int dml_packet_send_description(struct dml_connection *dc, 
    uint8_t id[DML_ID_SIZE], uint8_t version, uint32_t bps, char *mime, 
    char *name, char *alias, char *description);
int dml_packet_parse_description(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *version, uint32_t *bps, char **mime,
    char **name, char **alias, char **description);

int dml_packet_send_certificate(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], void *data, size_t len);
int dml_packet_parse_certificate(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], void **cert_data, size_t *cert_len);

int dml_packet_send_req_description(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE]);
int dml_packet_parse_req_description(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE]);

int dml_packet_send_req_certificate(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE]);
int dml_packet_parse_req_certificate(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE]);

int dml_packet_send_req_header(struct dml_connection *dc,
    uint8_t id_req[DML_ID_SIZE]);
int dml_packet_parse_req_header(uint8_t *data, uint16_t len,
    uint8_t id_req[DML_ID_SIZE]);

int dml_packet_send_route(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t hops);
int dml_packet_parse_route(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *hops);

int dml_packet_send_header(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void *data, size_t len);
int dml_packet_parse_header(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void **header_data, size_t *header_len);

int dml_packet_send_connect(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint16_t packet_id);
int dml_packet_parse_connect(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint16_t *packet_id);

int dml_packet_send_disc(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t reason);
int dml_packet_parse_disc(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t *reason);

int dml_packet_send_req_disc(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE]);
int dml_packet_parse_req_disc(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE]);

int dml_packet_send_req_reverse(struct dml_connection *dc,
    uint8_t id[DML_ID_SIZE], uint8_t rev_id[DML_ID_SIZE], uint8_t action, uint16_t status);
int dml_packet_parse_req_reverse(uint8_t *data, uint16_t len,
    uint8_t id[DML_ID_SIZE], uint8_t rev_id[DML_ID_SIZE], uint8_t *action, uint16_t *status);


int dml_packet_send_data(struct dml_connection *dc,
    uint16_t packet_id, void *data, size_t len, uint64_t timestamp, struct dml_crypto_key *dk);
int dml_packet_parse_data(uint8_t *data, uint16_t len,
    void **payload_data, size_t *payload_len, uint64_t *timestamp,
    struct dml_crypto_key *dk);
int dml_packet_parse_data_unverified(uint8_t *data, uint16_t len,
    void **payload_data, size_t *payload_len, uint64_t *timestamp);

#endif /* _DML_PACKET_H_ */
