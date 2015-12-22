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
#include "dml_stream.h"
#include "dml_packet.h"
#include "dml_id.h"

#include <string.h>

struct dml_stream {
	struct dml_stream *next;
	
	uint8_t id[DML_ID_SIZE];

	uint8_t version;
	uint32_t bps;
	char *mime;
	char *name;
	char *alias;
	char *description;
	
	struct dml_crypto_key *crypto;
	
	uint16_t data_id;
	uint64_t timestamp;
};

static struct dml_stream *streams = NULL;

struct dml_stream *dml_stream_by_id(uint8_t id[DML_ID_SIZE])
{
	struct dml_stream *stream;
	
	for (stream = streams; stream; stream = stream->next)
		if (!memcmp(stream->id, id, DML_ID_SIZE))
			break;
	return stream;
}

struct dml_stream *dml_stream_by_id_alloc(uint8_t id[DML_ID_SIZE])
{
	struct dml_stream *stream = dml_stream_by_id(id);
	
	if (!stream) {
		stream = calloc(1, sizeof(struct dml_stream));
		if (stream) {
			stream->next = streams;
			streams = stream;
			memcpy(stream->id, id, DML_ID_SIZE);
		}
	}
		
	return stream;
}

struct dml_stream *dml_stream_by_data_id(uint16_t data_id)
{
	struct dml_stream *stream;
	
	for (stream = streams; stream; stream = stream->next)
		if (stream->data_id == data_id)
			break;

	return stream;
}

void dml_stream_remove(struct dml_stream *ds)
{
	struct dml_stream **entry;
	
	for (entry = &streams; *entry; entry = &(*entry)->next) {
		if (ds != *entry)
			break;
		*entry = ds->next;
		
		free(ds->name);
		free(ds->alias);
		free(ds->description);
		free(ds->mime);
		
		dml_crypto_key_free(ds->crypto);
		
		free(ds);
	}
}

int dml_stream_update_description(uint8_t *data, uint16_t len)
{
	uint8_t id[DML_ID_SIZE];
	uint8_t v_id[DML_ID_SIZE];
	uint8_t version;
	uint32_t bps;
	char *mime;
	char *name;
	char *alias;
	char *description;

	struct dml_stream *stream;
		
	if (dml_packet_parse_description(data, len, id, &version, &bps, 
	    &mime, &name, &alias, &description))
		goto err_parse;

	if (dml_id_gen(v_id, version, bps, mime, name, alias, description))
		goto err_id;
	
	if (memcmp(id, v_id, DML_ID_SIZE))
		goto err_id_cmp;
	
	stream = dml_stream_by_id_alloc(id);
	if (!stream)
		goto err_stream;

	free(stream->name);
	free(stream->alias);
	free(stream->description);
	free(stream->mime);
	stream->name = name;
	stream->alias = alias;
	stream->description = description;
	stream->mime = mime;

	return 0;

err_stream:
err_id_cmp:
err_id:
	free(description);
	free(alias);
	free(name);
	free(mime);
err_parse:
	return -1;
}

char *dml_stream_name_get(struct dml_stream *stream)
{
	return stream->name;
}

struct dml_crypto_key *dml_stream_crypto_get(struct dml_stream *stream)
{
	return stream->crypto;
}

int dml_stream_crypto_set(struct dml_stream *stream, struct dml_crypto_key *crypto)
{
	stream->crypto = crypto;
	return 0;
}

uint16_t dml_stream_data_id_get(struct dml_stream *ds)
{
	return ds->data_id;
}

int dml_stream_data_id_set(struct dml_stream *ds, uint16_t data_id)
{
	ds->data_id = data_id;
	return 0;
}
