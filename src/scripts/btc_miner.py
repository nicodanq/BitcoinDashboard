import hashlib
import struct
import time
import requests
import json
import sys

def hash256(data):
    """Calculer le hash SHA-256 d'une donnée."""
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def merkle_root(txids):
    """Calculer le Merkle Root à partir d'une liste de transactions."""
    if not txids:
        return b'\x00' * 32
    
    tx_hashes = [bytes.fromhex(tx)[::-1] for tx in txids]
    
    while len(tx_hashes) > 1:
        if len(tx_hashes) % 2 == 1:
            tx_hashes.append(tx_hashes[-1])
        tx_hashes = [
            hash256(tx_hashes[i] + tx_hashes[i + 1])
            for i in range(0, len(tx_hashes), 2)
        ]
    return tx_hashes[0]

def mine_block(selected_transactions, max_iterations=4294967295):  # 2^32 - 1 (limite réelle du nonce Bitcoin)
    """Miner un bloc avec les transactions sélectionnées."""
    
    print("🚀 Démarrage du minage...")
    print(f"📝 Transactions sélectionnées: {len(selected_transactions)}")
    print("⚠️  MINAGE EN CONDITIONS RÉELLES - Utilise la vraie difficulté Bitcoin")
    print(f"🔢 Limite du nonce: {max_iterations:,} (32 bits non signés)")
    
    # Récupérer les données du bloc précédent
    try:
        previous_block_hash = requests.get("https://blockstream.info/api/blocks/tip/hash").text.strip()
        res = requests.get(f"https://blockstream.info/api/block/{previous_block_hash}")
        block_data = res.json()
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des données: {e}")
        return
    
    # Extraire les données du bloc
    version = block_data["version"]
    bits = block_data["bits"]
    
    # Calculer le Merkle Root
    root = merkle_root(selected_transactions)
    print(f"🌳 Merkle Root calculé: {root.hex()}")
    
    # Préparer l'en-tête du bloc
    version_bytes = struct.pack("<L", version)
    prev_block_bytes = bytes.fromhex(previous_block_hash)[::-1]
    merkle_root_bytes = root[::-1]
    timestamp = int(time.time())
    timestamp_bytes = struct.pack("<L", timestamp)
    bits_bytes = struct.pack("<L", bits)
    nonce = 0
    
    # Calculer la cible (difficulté réelle du réseau Bitcoin)
    target = (bits & 0xffffff) * 2**(8 * ((bits >> 24) - 3))
    print(f"🎯 Cible (difficulté réelle): {target}")
    print(f"🔧 Bits: {hex(bits)}")
    print("💡 Note: Cette difficulté est celle du vrai réseau Bitcoin !")
    
    start_time = time.time()
    last_progress_time = start_time
    
    print("\n⛏️  Début du minage avec difficulté réelle Bitcoin...")
    print("📊 Affichage du progrès toutes les 100,000 tentatives")
    
    while nonce <= max_iterations:
        nonce_bytes = struct.pack("<L", nonce)
        block_header = (
            version_bytes +
            prev_block_bytes +
            merkle_root_bytes +
            timestamp_bytes +
            bits_bytes +
            nonce_bytes
        )
        
        hash_result = hash256(block_header)
        hash_int = int.from_bytes(hash_result, byteorder='big')
        
        if hash_int < target:
            elapsed_time = time.time() - start_time
            hashrate = nonce / elapsed_time if elapsed_time > 0 else 0
            
            print("\n🎉 BLOC MINÉ AVEC SUCCÈS ! 🎉")
            print("=" * 50)
            print(f"🔢 Nonce gagnant: {nonce:,}")
            print(f"🔐 Hash du bloc: {hash_result[::-1].hex()}")
            print(f"⏱️  Temps de minage: {elapsed_time:.2f} secondes")
            print(f"⚡ Hashrate moyen: {format_hashrate(hashrate)}")
            print(f"🏆 Tentatives nécessaires: {nonce:,}")
            print("=" * 50)
            
            # Retourner les résultats sous format JSON
            result = {
                "success": True,
                "nonce": nonce,
                "hash": hash_result[::-1].hex(),
                "time": elapsed_time,
                "hashrate": hashrate,
                "iterations": nonce
            }
            print(f"\n📊 RÉSULTATS: {json.dumps(result)}")
            return
        
        nonce += 1
        
        # Afficher le progrès toutes les 100,000 itérations
        if nonce % 100000 == 0:
            current_time = time.time()
            elapsed = current_time - start_time
            interval_time = current_time - last_progress_time
            hashrate = nonce / elapsed if elapsed > 0 else 0
            interval_hashrate = 100000 / interval_time if interval_time > 0 else 0
            
            print(f"⛏️  Nonce: {nonce:,} | Hash: {hash_result[::-1].hex()[:16]}... | Temps: {elapsed:.1f}s | {format_hashrate(hashrate)} | Intervalle: {format_hashrate(interval_hashrate)}")
            last_progress_time = current_time
    
    # Si on a atteint la limite du nonce sans trouver de solution
    elapsed_time = time.time() - start_time
    hashrate = max_iterations / elapsed_time if elapsed_time > 0 else 0
    
    print(f"\n❌ LIMITE DU NONCE ATTEINTE")
    print("=" * 50)
    print(f"🔢 Nonce maximum testé: {max_iterations:,}")
    print(f"⏱️  Temps total: {elapsed_time:.2f} secondes")
    print(f"⚡ Hashrate moyen: {format_hashrate(hashrate)}")
    print("💡 En conditions réelles, les mineurs modifient le timestamp ou les transactions")
    print("=" * 50)
    
    result = {
        "success": False,
        "iterations": max_iterations,
        "time": elapsed_time,
        "hashrate": hashrate
    }
    print(f"\n📊 RÉSULTATS: {json.dumps(result)}")

def format_hashrate(hashrate):
    """Formater le hashrate avec les bonnes unités."""
    if hashrate == 0:
        return "0 H/s"
    
    units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"]
    unit_index = 0
    
    while hashrate >= 1000 and unit_index < len(units) - 1:
        hashrate /= 1000
        unit_index += 1
    
    return f"{hashrate:.2f} {units[unit_index]}"

if __name__ == "__main__":
    # Récupérer les transactions sélectionnées depuis les arguments
    if len(sys.argv) > 1:
        selected_transactions = sys.argv[1].split(',')
    else:
        # Par défaut, récupérer les 10 premières transactions du mempool
        try:
            res = requests.get("https://blockstream.info/api/mempool/txids")
            transactions_list = res.json()
            selected_transactions = transactions_list[:10]
        except:
            selected_transactions = []
    
    # Lancer le minage
    mine_block(selected_transactions)
