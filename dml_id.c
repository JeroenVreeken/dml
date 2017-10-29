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
#define _GNU_SOURCE

#include <dml/dml_id.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>
#include <openssl/sha.h>

static char assert1[SHA256_DIGEST_LENGTH - DML_ID_SIZE] __attribute__ ((unused));
static char assert2[DML_ID_SIZE - SHA256_DIGEST_LENGTH] __attribute__ ((unused));

int dml_id_gen(uint8_t id[DML_ID_SIZE], uint8_t version, uint32_t bps,
    char *mime, char *name, char *alias, char *description)
{
	SHA256_CTX sha256;
	uint8_t vbps[5];

	vbps[0] = version;
	vbps[1] = (bps >> 24) & 0xff;
	vbps[2] = (bps >> 16) & 0xff;
	vbps[3] = (bps >> 8) & 0xff;
	vbps[4] = (bps) & 0xff;

	SHA256_Init(&sha256);
	
	SHA256_Update(&sha256, vbps, sizeof(vbps));
	SHA256_Update(&sha256, mime, strlen(mime));
	SHA256_Update(&sha256, name, strlen(name));
	SHA256_Update(&sha256, alias, strlen(alias));
	SHA256_Update(&sha256, description, strlen(description));
	
	SHA256_Final(id, &sha256);

	return 0;
}

char *dml_id_str(uint8_t id[DML_ID_SIZE])
{
	char *str;
	
	if (asprintf(&str,
	    "%02x%02x%02x%02x%02x%02x%02x%02x"
	    "%02x%02x%02x%02x%02x%02x%02x%02x"
	    "%02x%02x%02x%02x%02x%02x%02x%02x"
	    "%02x%02x%02x%02x%02x%02x%02x%02x",
	    id[0],  id[1],  id[2],  id[3],  id[4],  id[5],  id[6],  id[7],
	    id[8],  id[9],  id[10], id[11], id[12], id[13], id[14], id[15],
	    id[16], id[17], id[18], id[19], id[20], id[21], id[22], id[23],
	    id[24], id[25], id[26], id[27], id[28], id[29], id[30], id[31]) < 0)
		str = NULL;

	return str;
}

int dml_str_id(uint8_t id[DML_ID_SIZE], char *str)
{
	int i;
	
	if (strlen(str) < DML_ID_SIZE * 2)
		return -1;
	
	for (i = 0; i < DML_ID_SIZE; i++) {
		uint8_t byte = 0;
		
		if (str[0] >= '0' && str[0] <= '9')
			byte += str[0] - '0';
		else if (tolower(str[0]) >= 'a' && tolower(str[0]) <= 'f')
			byte += tolower(str[0]) - 'a' + 10;
		else
			return -1;
		
		byte <<= 4;
		str++;
		
		if (str[0] >= '0' && str[0] <= '9')
			byte += str[0] - '0';
		else if (tolower(str[0]) >= 'a' && tolower(str[0]) <= 'f')
			byte += tolower(str[0]) - 'a' + 10;
		else
			return -1;
		
		str++;
		id[i] = byte;
		
	}
	
	return 0;
}
