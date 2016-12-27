/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

#include <fprs_parse.h>
#include <fprs_db.h>
#include <eth_ar/fprs.h>

#include <string.h>
#include <stdio.h>

#define FPRS_MIN_HOLDOFF (1)
#define FPRS_UNCHANGED_HOLDOFF (5*60)
#define FPRS_REQ_TIMEOUT (59)
#define FPRS_REQ_RETRY (5)

struct fprs_request {
	struct fprs_db_id id;
	
	enum fprs_type type;
	time_t t_req;
	time_t t_up;
	unsigned int link;
	
	struct fprs_request *next;
};

static struct fprs_request *requests = NULL;

static int fprs_request_add(struct fprs_db_id *id, enum fprs_type type, time_t t_req, unsigned int link)
{
	struct fprs_request *req, **entryp;

	/* check if already in requests */
	for (req = requests; req; req = req->next) {
		if (!memcmp(&req->id, id, sizeof(*id)) &&
		    req->type == type) {
			req->t_req = t_req;
			req->link |= link;
			return 0;
		}
	}
	
	req = calloc(1, sizeof(*req));
	if (!req)
		return -1;
	
	req->id = *id;
	req->type = type;
	req->t_req = t_req;
	req->link |= link;
	
	/* Add to existing request with same id if possible */
	for (entryp = &requests; *entryp; entryp = &(*entryp)->next) {
		if (!memcmp(&(*entryp)->id, id, sizeof(*id))) {
			req->next = *entryp;
			*entryp = req;
			return 0;
		}
	}
	*entryp = req;
	
	return 0;
}

static int fprs_request_remove(struct fprs_db_id *id, enum fprs_type type)
{
	struct fprs_request **entryp;
	
	for (entryp = &requests; *entryp; entryp = &(*entryp)->next) {
		if (!memcmp(&(*entryp)->id, id, sizeof(*id)) &&
		    (*entryp)->type == type) {
			struct fprs_request *entry = *entryp;
			
			*entryp = entry->next;
			free(entry);
			return 0;
		}
	}
	return -1;
}

int fprs_parse_request_flush(
    int (*cb)(void *data, size_t size, unsigned int link, void *arg),
    void *arg)
{
	struct fprs_request **entryp, **nextp;
	int r;
	unsigned int link = 0;
	time_t now = time(NULL);
	
	for (entryp = &requests; *entryp; entryp = nextp) {
		nextp = &(*entryp)->next;
		bool remove = false;
		
		switch ((*entryp)->type) {
			case FPRS_POSITION:
			case FPRS_SYMBOL:
			case FPRS_ALTITUDE:
			case FPRS_VECTOR:
			case FPRS_COMMENT:
			case FPRS_DMLSTREAM:
			case FPRS_DMLASSOC: {
				struct fprs_frame *reply;
				time_t t;
				uint8_t *el_data;
				size_t el_size;
				
				r = fprs_db_element_get(
				    &(*entryp)->id, (*entryp)->type,
				    &t, &el_data, &el_size);
				if (!r) {
					reply = fprs_frame_create();
					if (!reply)
						goto err;
					fprs_frame_add_callsign(reply, (*entryp)->id.id.callsign);
					fprs_frame_add_timestamp(reply, t);
					link = 0;

					struct fprs_element *el = fprs_frame_element_add(
					    reply, (*entryp)->type, el_size);
					if (el) {
						link = (*entryp)->link;
						memcpy(fprs_element_data(el), el_data, el_size);
					}
					fprs_request_remove(&(*entryp)->id, (*entryp)->type);
					remove = true;
					nextp = entryp;
					free(el_data);

					uint8_t *reply_data;
					size_t reply_size = fprs_frame_data_size(reply);
		
					reply_data = calloc(reply_size, sizeof(uint8_t));
					if (reply_data) {
						fprs_frame_data_get(reply, reply_data, &reply_size);
						cb(reply_data, reply_size, link, arg);
						free(reply_data);
					}
			
					fprs_frame_destroy(reply);
				}
				break;
			}
			default:
				remove = true;
				fprs_request_remove(&(*entryp)->id, (*entryp)->type);
				nextp = entryp;

				break;
		}
		if (!remove) {
			if (now - (*entryp)->t_req > FPRS_REQ_TIMEOUT) {
				fprs_request_remove(&(*entryp)->id, (*entryp)->type);
				nextp = entryp;
			} else if (now - (*entryp)->t_up > FPRS_REQ_RETRY &&
			    (*entryp)->link & FPRS_PARSE_DOWNLINK) {
				struct fprs_frame *frame_up;
				frame_up = fprs_frame_create();
				if (frame_up) {
					uint8_t *up_data;
					size_t up_size;
					
					fprs_frame_add_request(frame_up, (*entryp)->id.id.callsign, &(*entryp)->type, 1);

					up_size = fprs_frame_data_size(frame_up);
					up_data = calloc(up_size, sizeof(uint8_t));
					if (up_data) {
						fprs_frame_data_get(frame_up, up_data, &up_size);
						cb(up_data, up_size, FPRS_PARSE_UPLINK, arg);
					
						(*entryp)->t_up = now;
						free(up_data);
					}
				}
			}
		}
	}
err:
	return 0;
}

int fprs_parse_data(void *data, size_t size, struct timespec *recv_time, unsigned int link,
    time_t t_valid,
    int (*cb)(void *data, size_t size, unsigned int link, void *arg),
    void *arg)
{
	int r = 0;
	struct fprs_frame *fprs_frame, *fprs_frame_prop;
	struct fprs_element *fprs_callsign;
	struct fprs_element *fprs_objectname;
	struct fprs_element *fprs_timestamp;
	struct fprs_element *fprs_element = NULL;
	struct fprs_element *fprs_request;
	struct fprs_db_id id = { 0 }; /* initialize to null for comparison */
	bool propagate = false;
	time_t t_rx = recv_time->tv_sec;
	
	fprs_frame = fprs_frame_create();
	if (!fprs_frame) {
		r = -1;
		goto err_frame;
	}
	fprs_frame_prop = fprs_frame_create();
	if (!fprs_frame_prop) {
		r = -1;
		goto err_prop;
	}
	
	fprs_frame_data_set(fprs_frame, data, size);
	
	fprs_callsign = fprs_frame_element_by_type(fprs_frame, FPRS_CALLSIGN);
	fprs_objectname = fprs_frame_element_by_type(fprs_frame, FPRS_OBJECTNAME);
	fprs_timestamp = fprs_frame_element_by_type(fprs_frame, FPRS_TIMESTAMP);

	/* Is it a request? */
	fprs_request = fprs_frame_element_by_type(fprs_frame, FPRS_REQUEST);
	if (fprs_request) {
		struct fprs_db_id req_id = { 0 };
		enum fprs_type req_el[128];
		int req_el_nr = sizeof(req_el)/sizeof(enum fprs_type);
		int i;
		
		req_id.type = FPRS_DB_ID_CALLSIGN;

		r = fprs_request_dec(req_id.id.callsign, req_el, &req_el_nr,
		    fprs_element_data(fprs_request),
		    fprs_element_size(fprs_request));
		
		if (r)
			goto skip;
		
		for (i = 0; i < req_el_nr; i++) {
			fprs_request_add(&req_id, req_el[i], t_rx, link);
		}
	}

	if (!fprs_callsign)
		if (fprs_objectname) {
			id.type = FPRS_DB_ID_OBJECT;
			char *name = strndup(
			    (char*)fprs_element_data(fprs_objectname),
			    fprs_element_size(fprs_objectname));
			strcpy(id.id.name, name);
			fprs_frame_add_objectname(fprs_frame_prop, id.id.name);
			free(name);
		} else {
			goto skip;
		}
	else {
		id.type = FPRS_DB_ID_CALLSIGN;
		memcpy(id.id.callsign, fprs_element_data(fprs_callsign), 6);
		fprs_frame_add_callsign(fprs_frame_prop, id.id.callsign);
	}
	
	if (fprs_timestamp) {
		time_t timestamp;
		fprs_timestamp_dec(&timestamp, fprs_element_data(fprs_timestamp), fprs_element_size(fprs_timestamp));
		if (timestamp < t_rx) {
			t_rx = timestamp;
		}
	}
	fprs_frame_add_timestamp(fprs_frame_prop, t_rx);

	/* Parse all (non-identifying, non-request elements and store data) */
	while ((fprs_element = fprs_frame_element_get(fprs_frame, fprs_element))) {
		enum fprs_type fprs_type = fprs_element_type(fprs_element);
		uint8_t *el_data = fprs_element_data(fprs_element);
		size_t el_size = fprs_element_size(fprs_element);
		
		switch (fprs_type) {
			case FPRS_POSITION:
			case FPRS_SYMBOL:
			case FPRS_ALTITUDE:
			case FPRS_VECTOR:
			case FPRS_COMMENT:
			case FPRS_DMLSTREAM:
			case FPRS_DMLASSOC: {
				time_t prev_t;
				uint8_t *prev_data;
				size_t prev_size;
				bool update = true;
				bool prop_el = true;
				
				r = fprs_db_element_get(&id, fprs_type, &prev_t, &prev_data, &prev_size);
				if (!r) {
					update = false;
					prop_el = false;
					if (prev_t <= t_rx) {
						if (prev_size != el_size ||
						    memcmp(prev_data, el_data, el_size)) {
							update = true;
						}
						if ((t_rx - prev_t >= FPRS_UNCHANGED_HOLDOFF) ||
						    (t_rx - prev_t >= FPRS_MIN_HOLDOFF && update)) {
							prop_el = true;
							update = true;
						}
						free(prev_data);
					}
				}
				if (update)
					fprs_db_element_set(&id, fprs_type, 
					    t_rx, t_valid, el_data, el_size);
				if (prop_el) {
					struct fprs_element *p_el = fprs_frame_element_add(
					    fprs_frame_prop, fprs_type, el_size);
					if (p_el) {
						memcpy(fprs_element_data(p_el), el_data, el_size);
					}
					propagate = true;
				}
				break;
			}
			default:
				break;
		}
	}
	
	if (propagate && link == FPRS_PARSE_DOWNLINK) {
		uint8_t *prop_data;
		size_t prop_size = fprs_frame_data_size(fprs_frame_prop);
		
		prop_data = calloc(prop_size, sizeof(uint8_t));
		if (prop_data) {
			fprs_frame_data_get(fprs_frame_prop, prop_data, &prop_size);
			cb(prop_data, prop_size, FPRS_PARSE_UPLINK, arg);
			free(prop_data);
		}
	}


skip:
	fprs_parse_request_flush(cb, arg);
	fprs_frame_destroy(fprs_frame_prop);
err_prop:
	fprs_frame_destroy(fprs_frame);
err_frame:
	return r;
}

