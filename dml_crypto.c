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
#include <dml/dml_crypto.h>
#include <dml/dml_stream.h>

#include <openssl/x509.h>
#include <openssl/x509v3.h>
#include <openssl/pem.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/ecdsa.h>
#include <openssl/sha.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

struct dml_crypto_key {
	EC_KEY *ec_key;
	
	X509 *cert;
	STACK_OF(X509) *chain;
};

X509_STORE *x509_store;
STACK_OF(X509) *certchain;

int dml_crypto_init(char *ca_file, char *ca_dir)
{
	/* Make sure we can find everything in the certificates */
	OpenSSL_add_all_algorithms();
	
	x509_store = X509_STORE_new();
	if (!x509_store)
		goto err_new;

	if (ca_file || ca_dir) {
		if (!X509_STORE_load_locations(x509_store, ca_file, ca_dir)) {
			goto err_load;
		}
//		printf("Loadded store locations\n");
	}
    
	return 0;

err_load:
	X509_STORE_free(x509_store);
err_new:
	x509_store = NULL;
	return -1;
}

struct dml_crypto_key *dml_crypto_key_create(void)
{
	return calloc(1, sizeof(struct dml_crypto_key));
}


static void free_chain(STACK_OF(X509) *chain)
{
	if (!chain)
		return;
	X509 *c;
	while ((c = sk_X509_pop(chain)))
		X509_free(c);
	
	sk_X509_free(chain);
}

int dml_crypto_cert_add_verify(void *certdata, size_t size, uint8_t id[DML_ID_SIZE])
{
	STACK_OF(X509) *chain;
	uint8_t *data = certdata;
	char *name;
	
	chain = sk_X509_new_null();
	if (!chain)
		return -1;

	while (size > 2) {
		X509 *cert;
		int certsize = (data[0] << 8) | data[1];
		const unsigned char *cert_data = data + 2;

//		printf("Cert: %zd %d\n", size, certsize);
		
		if (certsize > size - 2)
			break;
		if (!certsize)
			break;
		
		cert = d2i_X509(NULL, &cert_data, certsize);
		if (!cert)
			break;

//		printf("cert: %p\n", cert);
		sk_X509_push(chain, cert);
		
		data += certsize + 2;
		size -= certsize + 2;
	}
	if (sk_X509_num(chain) < 1)
		goto err_stack;
	
	X509 *cert = sk_X509_pop(chain);
//	printf("1st cert %p\n", cert);

	X509_STORE_CTX *ctx = X509_STORE_CTX_new();
	if (!ctx)
		goto err_ctx;
	if (X509_STORE_CTX_init(ctx, x509_store, cert, chain) != 1) {
		X509_STORE_CTX_free(ctx);
		goto err_ctx;
	}

    	int rc = X509_verify_cert(ctx);
//	int err = X509_STORE_CTX_get_error(ctx);
	X509_STORE_CTX_free(ctx);

//	fprintf(stderr, "verify cert rc: %d: %d\n", rc, err);
	if (rc != 1) {
		int x509_err = X509_STORE_CTX_get_error(ctx);
		fprintf(stderr, "verify error: %d: %s\n", x509_err, X509_verify_cert_error_string(x509_err));
		goto err_verify;
	}
	
	struct dml_stream *ds = dml_stream_by_id(id);
	if (!ds)
		goto err_stream;
	name = dml_stream_name_get(ds);
	if (!name)
		goto err_name;
	rc = X509_check_host(cert, name, 0, X509_CHECK_FLAG_ALWAYS_CHECK_SUBJECT, NULL);
//	fprintf(stderr, "check host rc: %d\n", rc);
	
	struct dml_crypto_key *dk = dml_stream_crypto_get(ds);
	if (!dk) {
		dk = dml_crypto_key_create();
		dml_stream_crypto_set(ds, dk);
	} else {
		free_chain(dk->chain);
		X509_free(dk->cert);
		EC_KEY_free(dk->ec_key);
	}
	dk->chain = chain;
	dk->cert = cert;
	EVP_PKEY *evp_key = X509_get_pubkey(cert);
	if (!evp_key)
		goto err_key;
	/* only 256 bits EC for now */
	if (EVP_PKEY_bits(evp_key) != 256)
		goto err_bits;
	dk->ec_key = EVP_PKEY_get1_EC_KEY(evp_key);
	if (!dk->ec_key)
		goto err_key_type;
	EVP_PKEY_free(evp_key);

	return !(rc == 1);

err_key_type:
err_bits:
	EVP_PKEY_free(evp_key);
err_key:
err_name:
err_stream:
err_verify:
	X509_free(cert);
err_ctx:
	free_chain(chain);
err_stack:

	return -1;
}

/* load a pem file */
int dml_crypto_load_cert(char *file)
{
	int ret = -1;
	X509 *cert;
	
	certchain = sk_X509_new_null();
	
	FILE *fp = fopen(file, "r");
	if (!fp)
		goto err_fopen;
	
	while ((cert = PEM_read_X509(fp, NULL, NULL, NULL))) {
		ret = 0;
		sk_X509_push(certchain, cert);
	}
	
	fclose(fp);
	
	return ret;

err_fopen:
	return -1;
}

int dml_crypto_cert_get(void **bincert, size_t *size)
{
	unsigned char *der = NULL;
	int bytes, i;
	uint8_t *bin = NULL;
	size_t binsize = 0;
	
	if (!certchain)
		return -1;

	for (i = 0; i < sk_X509_num(certchain); i++) {
		X509 *cert = sk_X509_value(certchain, i);

		bytes = i2d_X509(cert, &der);
		if (bytes >= 0) { 
			bin = realloc(bin, binsize + sizeof(uint16_t) + bytes);
			
			bin[binsize + 0] = (bytes >> 8) & 0xff;
			bin[binsize + 1] = (bytes) & 0xff;
			memcpy(bin + binsize + 2, der, bytes);
			binsize += sizeof(uint16_t) + bytes;
			
			free(der);
		}
	}
	*size = binsize;
	*bincert = bin;
	
	return 0;
}

struct dml_crypto_key *dml_crypto_private_load(char *file)
{
	struct dml_crypto_key *dk;
	EVP_PKEY *evp_key;
	FILE *fp;

	dk = calloc(1, sizeof(struct dml_crypto_key));
	if (!dk)
		goto err_malloc;

	fp = fopen(file, "r");
	if (!fp)
		goto err_fopen;
	evp_key = PEM_read_PrivateKey(fp, NULL, NULL, NULL);
	dk->ec_key = EVP_PKEY_get1_EC_KEY(evp_key);
	EVP_PKEY_free(evp_key);
	fclose(fp);

	return dk;
err_fopen:
	free(dk);
err_malloc:
	return NULL;
}

struct dml_crypto_key *dml_crypto_public_get(uint8_t id[DML_ID_SIZE])
{
	struct dml_stream *ds = dml_stream_by_id(id);
	if (!ds)
		return NULL;
	struct dml_crypto_key *dk = dml_stream_crypto_get(ds);
	if (!dk)
		return NULL;
	
	return dk;
}

bool dml_crypto_verify(void *data, size_t len, uint8_t sig[DML_SIG_SIZE], struct dml_crypto_key *dk)
{
	uint8_t digest[SHA256_DIGEST_LENGTH];
	SHA256_CTX sha256;

	SHA256_Init(&sha256);
	SHA256_Update(&sha256, data, len);
	SHA256_Final(digest, &sha256);

	ECDSA_SIG *ecsig = ECDSA_SIG_new();
#if (OPENSSL_VERSION_NUMBER < 0x10100000)
	BN_bin2bn(sig, 32, ecsig->r);
	BN_bin2bn(sig + 32, 32, ecsig->s);
#else
	BIGNUM *r, *s;
	r = BN_bin2bn(sig, 32, NULL);
	s = BN_bin2bn(sig + 32, 32, NULL);
	ECDSA_SIG_set0(ecsig, r, s);
#endif
	
 	int ret = ECDSA_do_verify(digest, SHA256_DIGEST_LENGTH, ecsig, dk->ec_key);

	ECDSA_SIG_free(ecsig);

	if (ret != 1) {
		unsigned int err = ERR_get_error();
		fprintf(stderr, "ret: %d ERR: %d\n", ret, err);
	}

	return ret == 1;
}

int dml_crypto_sign(uint8_t sig[DML_SIG_SIZE], void *data, size_t len, struct dml_crypto_key *dk)
{
	uint8_t digest[SHA256_DIGEST_LENGTH];
	SHA256_CTX sha256;

	SHA256_Init(&sha256);
	SHA256_Update(&sha256, data, len);
	SHA256_Final(digest, &sha256);

	ECDSA_SIG *ecsig = ECDSA_do_sign(digest, SHA256_DIGEST_LENGTH, dk->ec_key);
	
	memset(sig, 0, 64);
#if (OPENSSL_VERSION_NUMBER < 0x10100000)
	int r_off = 32 - BN_num_bytes(ecsig->r);
	int s_off = 32 - BN_num_bytes(ecsig->s);
	BN_bn2bin(ecsig->r, sig + r_off);
	BN_bn2bin(ecsig->s, sig + 32 + s_off);
#else
	const BIGNUM *r, *s;
	ECDSA_SIG_get0(ecsig, &r, &s);
	int r_off = 32 - BN_num_bytes(r);
	int s_off = 32 - BN_num_bytes(s);
	BN_bn2bin(r, sig + r_off);
	BN_bn2bin(s, sig + 32 + s_off);
#endif
	ECDSA_SIG_free(ecsig);

	return 0;
}

void dml_crypto_key_free(struct dml_crypto_key *dk)
{
	if (!dk)
		return;
	if (dk->ec_key)
		EC_KEY_free(dk->ec_key);
	free(dk);
}
