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
#ifndef _INCLUDE_DML_CRYPTO_H_
#define _INCLUDE_DML_CRYPTO_H_

#include "dml.h"

#include <openssl/pem.h>

struct dml_crypto_key {
	EC_KEY *ec_key;
	
	X509 *cert;
	STACK_OF(X509) *chain;
};

int dml_crypto_init(char *ca_file, char *ca_dir);

int dml_crypto_cert_add_verify(void *cert, size_t size, uint8_t id[DML_ID_SIZE]);

int dml_crypto_load_cert(char *file);
int dml_crypto_cert_get(void **cert, size_t *size);

struct dml_crypto_key *dml_crypto_private_load(char *file);
struct dml_crypto_key *dml_crypto_public_get(uint8_t id[DML_ID_SIZE]);

int dml_crypto_sign(uint8_t sig[DML_SIG_SIZE], void *data, size_t len, struct dml_crypto_key *dk);
bool dml_crypto_verify(void *data, size_t len, uint8_t sig[DML_SIG_SIZE], struct dml_crypto_key *dk);

void dml_crypto_key_free(struct dml_crypto_key *);

#endif /* _INCLUDE_DML_CRYPTO_H_ */
