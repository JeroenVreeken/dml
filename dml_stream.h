/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016

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
#ifndef _INCLUDE_DML_STREAM_H_
#define _INCLUDE_DML_STREAM_H_

#include "dml_id.h"

#include <inttypes.h>

struct dml_stream *dml_stream_update_description(uint8_t *data, uint16_t len);

struct dml_stream *dml_stream_by_id(uint8_t id[DML_ID_SIZE]);
struct dml_stream *dml_stream_by_id_alloc(uint8_t id[DML_ID_SIZE]);
struct dml_stream *dml_stream_by_data_id(uint16_t data_id);
struct dml_stream *dml_stream_by_alias(char *alias);

uint8_t *dml_stream_id_get(struct dml_stream *ds);
char *dml_stream_name_get(struct dml_stream *ds);
int dml_stream_name_set(struct dml_stream *stream, char *name);
char *dml_stream_alias_get(struct dml_stream *stream);
int dml_stream_alias_set(struct dml_stream *stream, char *alias);
char *dml_stream_mime_get(struct dml_stream *stream);
int dml_stream_mime_set(struct dml_stream *stream, char *mime);
char *dml_stream_description_get(struct dml_stream *stream);
int dml_stream_description_set(struct dml_stream *stream, char *description);
struct dml_crypto_key *dml_stream_crypto_get(struct dml_stream *ds);
int dml_stream_crypto_set(struct dml_stream *ds, struct dml_crypto_key *crypto);
uint16_t dml_stream_data_id_get(struct dml_stream *ds);
int dml_stream_data_id_set(struct dml_stream *ds, uint16_t data_id);
uint64_t dml_stream_timestamp_get(struct dml_stream *ds);
int dml_stream_timestamp_set(struct dml_stream *ds, uint64_t timestamp);
uint32_t dml_stream_bps_get(struct dml_stream *ds);
int dml_stream_bps_set(struct dml_stream *ds, uint32_t bps);

struct dml_stream_priv;
struct dml_stream_priv *dml_stream_priv_get(struct dml_stream *ds);
int dml_stream_priv_set(struct dml_stream *ds, struct dml_stream_priv *priv);

void dml_stream_remove(struct dml_stream *ds);

struct dml_stream *dml_stream_iterate(struct dml_stream *prev);

#endif /* _INCLUDE_DML_STREAM_H_ */
