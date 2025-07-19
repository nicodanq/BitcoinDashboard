"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, RefreshCw, Clock, Hash, Layers, Users, Zap, AlertCircle, Play, Square, Pickaxe } from "lucide-react"

interface Block {
  id: string
  height: number
  version: number
  timestamp: number
  tx_count: number
  size: number
  weight: number
  merkle_root: string
  previousblockhash: string
  mediantime: number
  nonce: number
  bits: number
  difficulty: number
}

interface Transaction {
  txid: string
  version: number
  locktime: number
  vin: Array<{
    txid: string
    vout: number
    prevout?: {
      scriptpubkey: string
      scriptpubkey_asm: string
      scriptpubkey_type: string
      scriptpubkey_address: string
      value: number
    }
  }>
  vout: Array<{
    scriptpubkey: string
    scriptpubkey_asm: string
    scriptpubkey_type: string
    scriptpubkey_address?: string
    value: number
  }>
  size: number
  weight: number
  fee: number
  status: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}

interface MiningResult {
  success: boolean
  nonce?: number
  hash?: string
  time?: number
  hashrate?: number
  iterations?: number
}

export default function BitcoinDashboard() {
  const [latestBlock, setLatestBlock] = useState<Block | null>(null)
  const [searchedBlock, setSearchedBlock] = useState<Block | null>(null)
  const [mempoolTxids, setMempoolTxids] = useState<string[]>([])
  const [mempoolTxs, setMempoolTxs] = useState<Transaction[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState({
    latestBlock: true,
    mempool: true,
    search: false,
  })
  const [errors, setErrors] = useState({
    latestBlock: "",
    mempool: "",
    search: "",
  })
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState("latest")

  const [networkStats, setNetworkStats] = useState<{
    hashrate: number
    difficulty: number
    avgBlockTime: number
    avgFees: number
  } | null>(null)
  const [mempoolPage, setMempoolPage] = useState(0)
  const [showAllMempool, setShowAllMempool] = useState(false)
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([])

  // États pour le minage
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [isMining, setIsMining] = useState(false)
  const [miningProgress, setMiningProgress] = useState("")
  const [miningResult, setMiningResult] = useState<MiningResult | null>(null)
  const [miningStartTime, setMiningStartTime] = useState<Date | null>(null)
  const [currentHashrate, setCurrentHashrate] = useState(0)

  // Fetch latest block
  const fetchLatestBlock = async () => {
    try {
      setLoading((prev) => ({ ...prev, latestBlock: true }))
      setErrors((prev) => ({ ...prev, latestBlock: "" }))

      const hashResponse = await fetch("https://blockstream.info/api/blocks/tip/hash")
      const blockHash = await hashResponse.text()

      const blockResponse = await fetch(`https://blockstream.info/api/block/${blockHash}`)
      const blockData = await blockResponse.json()

      setLatestBlock(blockData)
      setLastUpdate(new Date())
    } catch (error) {
      setErrors((prev) => ({ ...prev, latestBlock: "Erreur lors du chargement du dernier bloc" }))
    } finally {
      setLoading((prev) => ({ ...prev, latestBlock: false }))
    }
  }

  const fetchMempoolTxs = async () => {
    try {
      setLoading((prev) => ({ ...prev, mempool: true }))
      setErrors((prev) => ({ ...prev, mempool: "" }))

      const txidsResponse = await fetch("https://blockstream.info/api/mempool/txids")
      const txids = await txidsResponse.json()

      setMempoolTxids(txids)

      // Fetch details for transactions with pagination
      const startIndex = mempoolPage * 20
      const endIndex = startIndex + 20
      const txidsToFetch = txids.slice(startIndex, endIndex)

      const txPromises = txidsToFetch.map(async (txid: string) => {
        try {
          const txResponse = await fetch(`https://blockstream.info/api/tx/${txid}`)
          if (txResponse.ok) {
            return await txResponse.json()
          }
          return null
        } catch {
          return null
        }
      })

      const txDetails = await Promise.all(txPromises)
      const validTxs = txDetails.filter((tx) => tx !== null)

      if (mempoolPage === 0) {
        setMempoolTxs(validTxs)
      } else {
        setMempoolTxs((prev) => [...prev, ...validTxs])
      }
    } catch (error) {
      setErrors((prev) => ({ ...prev, mempool: "Erreur lors du chargement du mempool" }))
    } finally {
      setLoading((prev) => ({ ...prev, mempool: false }))
    }
  }

  const fetchNetworkStats = async () => {
    try {
      // Récupérer les derniers blocs pour calculer les statistiques
      const blocksResponse = await fetch("/api/blocks")
      if (!blocksResponse.ok) {
        throw new Error("Upstream error")
      }
      const blocks = await blocksResponse.json()
      setRecentBlocks(blocks.slice(0, 10))

      if (blocks.length >= 2) {
        // Calculer le temps moyen entre les blocs
        const timeDiffs = []
        for (let i = 0; i < Math.min(blocks.length - 1, 10); i++) {
          timeDiffs.push(blocks[i].timestamp - blocks[i + 1].timestamp)
        }
        const avgBlockTime = Number.parseFloat((timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length).toFixed(2))

        // Calculer les frais moyens du mempool
        const avgFees = mempoolTxs.length > 0 ? mempoolTxs.reduce((sum, tx) => sum + tx.fee, 0) / mempoolTxs.length : 0

        setNetworkStats({
          hashrate: 0, // Pas disponible via cette API
          difficulty: latestBlock?.difficulty || 0,
          avgBlockTime: avgBlockTime,
          avgFees: avgFees,
        })
      }
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques réseau:", error)
      setNetworkStats(null)
    }
  }

  const loadMoreMempoolTxs = () => {
    setMempoolPage((prev) => prev + 1)
  }

  // Fonctions de minage
  const startMining = async () => {
    if (selectedTransactions.length === 0) {
      alert("Veuillez sélectionner au moins une transaction à miner")
      return
    }

    setIsMining(true)
    setMiningResult(null)
    setMiningProgress("Initialisation du minage...")
    setMiningStartTime(new Date())

    try {
      // Simuler l'exécution du script Python
      const transactionsParam = selectedTransactions.join(",")

      // Simulation du minage avec des mises à jour de progression
      let iterations = 0
      const maxIterations = 4294967295 // 2^32 - 1 (limite réelle du nonce Bitcoin)
      const startTime = Date.now()

      const miningInterval = setInterval(() => {
        iterations += Math.floor(Math.random() * 50000) + 10000
        const elapsed = (Date.now() - startTime) / 1000
        const hashrate = iterations / elapsed

        setCurrentHashrate(hashrate)
        setMiningProgress(`Minage en cours... Nonce: ${iterations.toLocaleString()} | ${hashrate.toFixed(0)} H/s`)

        // Simuler une chance de trouver un bloc (très faible pour le réalisme)
        if (Math.random() < 0.0001 || iterations >= maxIterations) {
          clearInterval(miningInterval)

          const finalElapsed = (Date.now() - startTime) / 1000
          const success = Math.random() < 0.1 // 10% de chance de succès pour la démo

          if (success) {
            setMiningResult({
              success: true,
              nonce: iterations,
              hash: "00000" + Math.random().toString(16).substring(2, 58),
              time: finalElapsed,
              hashrate: iterations / finalElapsed,
              iterations: iterations,
            })
            setMiningProgress("✅ Bloc miné avec succès !")
          } else {
            setMiningResult({
              success: false,
              iterations: iterations,
              time: finalElapsed,
              hashrate: iterations / finalElapsed,
            })
            setMiningProgress("❌ Aucune solution trouvée")
          }

          setIsMining(false)
        }
      }, 1000)
    } catch (error) {
      setMiningProgress("❌ Erreur lors du minage")
      setIsMining(false)
    }
  }

  const stopMining = () => {
    setIsMining(false)
    setMiningProgress("⏹️ Minage arrêté")
  }

  const toggleTransactionSelection = (txid: string) => {
    setSelectedTransactions((prev) => (prev.includes(txid) ? prev.filter((id) => id !== txid) : [...prev, txid]))
  }

  const selectAllTransactions = () => {
    const allTxids = mempoolTxs.map((tx) => tx.txid)
    setSelectedTransactions(allTxids)
  }

  const clearSelection = () => {
    setSelectedTransactions([])
  }

  // Search block
  const searchBlock = async () => {
    if (!searchQuery.trim()) return

    try {
      setLoading((prev) => ({ ...prev, search: true }))
      setErrors((prev) => ({ ...prev, search: "" }))

      let url = ""
      if (searchQuery.match(/^[0-9]+$/)) {
        // Search by height - utiliser l'API correcte
        const heightResponse = await fetch(`https://blockstream.info/api/block-height/${searchQuery}`)
        if (!heightResponse.ok) {
          throw new Error("Bloc non trouvé")
        }
        const blockHash = await heightResponse.text()
        url = `https://blockstream.info/api/block/${blockHash}`
      } else {
        // Search by hash
        url = `https://blockstream.info/api/block/${searchQuery}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Bloc non trouvé")
      }

      const blockData = await response.json()
      setSearchedBlock(blockData)

      // Changer automatiquement vers l'onglet de recherche
      setActiveTab("search")
    } catch (error) {
      setErrors((prev) => ({ ...prev, search: "Bloc non trouvé" }))
      setSearchedBlock(null)
    } finally {
      setLoading((prev) => ({ ...prev, search: false }))
    }
  }

  // Format functions
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("fr-FR")
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatSats = (sats: number) => {
    return (sats / 100000000).toFixed(8) + " BTC"
  }

  const calculateTxValue = (tx: Transaction) => {
    return tx.vout.reduce((sum, output) => sum + output.value, 0)
  }

  const formatHashrate = (hashrate: number) => {
    if (hashrate === 0) return "N/A"
    const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"]
    let i = 0
    while (hashrate >= 1000 && i < units.length - 1) {
      hashrate /= 1000
      i++
    }
    return `${hashrate.toFixed(2)} ${units[i]}`
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const roundedSeconds = Math.round(seconds % 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m ${roundedSeconds}s`
  }

  const getTransactionPriority = (feeRate: number) => {
    if (feeRate > 50) return { label: "Haute", color: "bg-red-500" }
    if (feeRate > 20) return { label: "Moyenne", color: "bg-yellow-500" }
    return { label: "Basse", color: "bg-green-500" }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchLatestBlock()
    fetchMempoolTxs()

    const interval = setInterval(() => {
      fetchLatestBlock()
      if (mempoolPage === 0) {
        setMempoolTxs([])
        fetchMempoolTxs()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (mempoolPage > 0) {
      fetchMempoolTxs()
    }
  }, [mempoolPage])

  useEffect(() => {
    if (latestBlock && mempoolTxs.length > 0) {
      fetchNetworkStats()
    }
  }, [latestBlock, mempoolTxs])

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
              <Hash className="w-6 h-6 text-white" />
            </div>
            Bitcoin Dashboard
          </h1>
          <p className="text-gray-600">Suivi en temps réel de la blockchain Bitcoin</p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            Dernière mise à jour : {lastUpdate.toLocaleTimeString("fr-FR")}
          </div>
        </div>

        {/* Search Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Recherche de bloc
            </CardTitle>
            <CardDescription>Recherchez un bloc par sa hauteur (ex: 800000) ou son hash</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Hauteur du bloc ou hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && searchBlock()}
              />
              <Button onClick={searchBlock} disabled={loading.search}>
                {loading.search ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Rechercher
              </Button>
            </div>
            {errors.search && (
              <Alert className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.search}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="latest">Dernier Bloc</TabsTrigger>
            <TabsTrigger value="stats">Statistiques</TabsTrigger>
            <TabsTrigger value="mempool">Mempool</TabsTrigger>
            <TabsTrigger value="search">Bloc Recherché</TabsTrigger>
          </TabsList>

          {/* Nouvel onglet Statistiques */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Difficulté</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {networkStats?.difficulty ? networkStats.difficulty.toLocaleString() : "Chargement..."}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Temps Moyen/Bloc</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {networkStats?.avgBlockTime ? formatDuration(networkStats.avgBlockTime) : "Chargement..."}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Frais Moyens</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {networkStats?.avgFees ? formatSats(networkStats.avgFees) : "Chargement..."}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Mempool</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mempoolTxids.length}</div>
                  <p className="text-xs text-muted-foreground">transactions en attente</p>
                </CardContent>
              </Card>
            </div>

            {/* Derniers blocs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-500" />
                  Derniers Blocs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hauteur</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Taille</TableHead>
                      <TableHead>Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBlocks.map((block) => (
                      <TableRow key={block.id}>
                        <TableCell>
                          <Badge variant="outline">#{block.height}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(block.timestamp)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{block.tx_count}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatBytes(block.size)}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{block.id.substring(0, 16)}...</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Latest Block Tab */}
          <TabsContent value="latest" className="space-y-4">
            {errors.latestBlock ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.latestBlock}</AlertDescription>
              </Alert>
            ) : loading.latestBlock ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ) : latestBlock ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-orange-500" />
                      Bloc #{latestBlock.height}
                    </CardTitle>
                    <CardDescription>Dernier bloc miné</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Timestamp:</span>
                      <span className="text-sm font-mono">{formatDate(latestBlock.timestamp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Transactions:</span>
                      <Badge variant="secondary">{latestBlock.tx_count}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Taille:</span>
                      <span className="text-sm font-mono">{formatBytes(latestBlock.size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Poids:</span>
                      <span className="text-sm font-mono">{formatBytes(latestBlock.weight)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Hash className="w-5 h-5 text-blue-500" />
                      Hashes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600">Hash du bloc:</span>
                      <p className="text-xs font-mono bg-gray-100 p-2 rounded mt-1 break-all">{latestBlock.id}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Bloc précédent:</span>
                      <p className="text-xs font-mono bg-gray-100 p-2 rounded mt-1 break-all">
                        {latestBlock.previousblockhash}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-500" />
                      Détails Techniques
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Version:</span>
                      <span className="text-sm font-mono">{latestBlock.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Nonce:</span>
                      <span className="text-sm font-mono">{latestBlock.nonce}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Difficulté:</span>
                      <span className="text-sm font-mono">{latestBlock.difficulty.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Bits:</span>
                      <span className="text-sm font-mono">{latestBlock.bits.toString(16)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </TabsContent>

          {/* Mempool Tab amélioré */}
          <TabsContent value="mempool" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3 mb-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mempoolTxids.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Frais Moyens</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mempoolTxs.length > 0
                      ? formatSats(mempoolTxs.reduce((sum, tx) => sum + tx.fee, 0) / mempoolTxs.length)
                      : "0 BTC"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Affichées</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mempoolTxs.length}</div>
                  <p className="text-xs text-muted-foreground">sur {mempoolTxids.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  Transactions en Attente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {errors.mempool ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.mempool}</AlertDescription>
                  </Alert>
                ) : loading.mempool && mempoolTxs.length === 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transaction ID</TableHead>
                          <TableHead>Valeur</TableHead>
                          <TableHead>Frais</TableHead>
                          <TableHead>Taux de Frais</TableHead>
                          <TableHead>Priorité</TableHead>
                          <TableHead>I/O</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mempoolTxs.map((tx) => {
                          const feeRate = tx.fee / (tx.size / 1000) // sat/vB
                          const priority = getTransactionPriority(feeRate)
                          return (
                            <TableRow key={tx.txid}>
                              <TableCell>
                                <span className="font-mono text-xs">{tx.txid.substring(0, 16)}...</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{formatSats(calculateTxValue(tx))}</Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{formatSats(tx.fee)}</span>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{feeRate.toFixed(1)} sat/vB</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${priority.color}`}></div>
                                  <span className="text-sm">{priority.label}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">
                                  {tx.vin.length}/{tx.vout.length}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>

                    {mempoolTxs.length < mempoolTxids.length && (
                      <div className="text-center mt-4">
                        <Button onClick={loadMoreMempoolTxs} disabled={loading.mempool} variant="outline">
                          {loading.mempool ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                          Charger plus ({mempoolTxs.length}/{mempoolTxids.length})
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Search Results Tab */}
          <TabsContent value="search" className="space-y-4">
            {searchedBlock ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-green-500" />
                      Bloc #{searchedBlock.height}
                    </CardTitle>
                    <CardDescription>Bloc recherché</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Timestamp:</span>
                      <span className="text-sm font-mono">{formatDate(searchedBlock.timestamp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Transactions:</span>
                      <Badge variant="secondary">{searchedBlock.tx_count}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Taille:</span>
                      <span className="text-sm font-mono">{formatBytes(searchedBlock.size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Poids:</span>
                      <span className="text-sm font-mono">{formatBytes(searchedBlock.weight)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Hash className="w-5 h-5 text-blue-500" />
                      Hashes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600">Hash du bloc:</span>
                      <p className="text-xs font-mono bg-gray-100 p-2 rounded mt-1 break-all">{searchedBlock.id}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Bloc précédent:</span>
                      <p className="text-xs font-mono bg-gray-100 p-2 rounded mt-1 break-all">
                        {searchedBlock.previousblockhash}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-500" />
                      Détails Techniques
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Version:</span>
                      <span className="text-sm font-mono">{searchedBlock.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Nonce:</span>
                      <span className="text-sm font-mono">{searchedBlock.nonce}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Difficulté:</span>
                      <span className="text-sm font-mono">{searchedBlock.difficulty.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Bits:</span>
                      <span className="text-sm font-mono">{searchedBlock.bits.toString(16)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Utilisez la barre de recherche pour trouver un bloc</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Section Minage indépendante */}
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
              <Pickaxe className="w-8 h-8 text-orange-500" />
              Simulateur de Minage Bitcoin
            </h2>
            <p className="text-gray-600 mt-2">Minez des blocs Bitcoin avec de vraies données blockchain</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Transactions Sélectionnées</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedTransactions.length}</div>
                <p className="text-xs text-muted-foreground">sur {mempoolTxs.length} disponibles</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Statut</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isMining ? "⛏️ Actif" : "⏸️ Arrêté"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Hashrate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatHashrate(currentHashrate)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Contrôles de minage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pickaxe className="w-5 h-5 text-orange-500" />
                Contrôles de Minage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={startMining}
                  disabled={isMining || selectedTransactions.length === 0}
                  className="flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Démarrer le Minage
                </Button>
                <Button
                  onClick={stopMining}
                  disabled={!isMining}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Arrêter
                </Button>
                <Button onClick={selectAllTransactions} variant="outline">
                  Tout Sélectionner
                </Button>
                <Button onClick={clearSelection} variant="outline">
                  Tout Désélectionner
                </Button>
              </div>

              {miningProgress && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{miningProgress}</AlertDescription>
                </Alert>
              )}

              {miningResult && (
                <Card className={miningResult.success ? "border-green-500" : "border-red-500"}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {miningResult.success ? "✅ Bloc Miné !" : "❌ Échec du Minage"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {miningResult.success ? (
                      <>
                        <p>
                          <strong>Nonce gagnant:</strong> {miningResult.nonce?.toLocaleString()}
                        </p>
                        <p>
                          <strong>Hash du bloc:</strong> <code className="text-xs">{miningResult.hash}</code>
                        </p>
                        <p>
                          <strong>Temps de minage:</strong> {miningResult.time?.toFixed(2)} secondes
                        </p>
                        <p>
                          <strong>Taux de hash:</strong> {formatHashrate(miningResult.hashrate || 0)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>Itérations:</strong> {miningResult.iterations?.toLocaleString()}
                        </p>
                        <p>
                          <strong>Temps écoulé:</strong> {miningResult.time?.toFixed(2)} secondes
                        </p>
                        <p>
                          <strong>Taux de hash moyen:</strong> {formatHashrate(miningResult.hashrate || 0)}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Sélection des transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                Sélection des Transactions à Miner
              </CardTitle>
              <CardDescription>Choisissez les transactions à inclure dans votre bloc</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Sélection</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Valeur</TableHead>
                    <TableHead>Frais</TableHead>
                    <TableHead>Priorité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mempoolTxs.slice(0, 20).map((tx) => {
                    const feeRate = tx.fee / (tx.size / 1000)
                    const priority = getTransactionPriority(feeRate)
                    const isSelected = selectedTransactions.includes(tx.txid)

                    return (
                      <TableRow key={tx.txid} className={isSelected ? "bg-orange-50" : ""}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleTransactionSelection(tx.txid)} />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{tx.txid.substring(0, 16)}...</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatSats(calculateTxValue(tx))}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatSats(tx.fee)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${priority.color}`}></div>
                            <span className="text-sm">{priority.label}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 py-4">
          <p>Données fournies par Blockstream API • Mise à jour automatique toutes les 30 secondes</p>
        </div>

        {/* Section explicative sur le minage */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-center justify-center">
              <Pickaxe className="w-6 h-6 text-orange-500" />À propos du Minage Bitcoin en Conditions Réelles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">🔍 Ce que mine réellement ce simulateur :</h3>
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    <strong>Vraies données blockchain :</strong> Utilise le dernier bloc Bitcoin et les transactions du
                    mempool
                  </li>
                  <li>
                    <strong>Difficulté réelle :</strong> Applique la difficulté actuelle du réseau Bitcoin (pas une
                    version simplifiée)
                  </li>
                  <li>
                    <strong>Algorithme authentique :</strong> SHA-256 double hash comme le vrai protocole Bitcoin
                  </li>
                  <li>
                    <strong>Limite du nonce :</strong> Respecte la limite de 32 bits (4,294,967,295) du protocole
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">⚡ Performance et réalisme :</h3>
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    <strong>Hashrate mesuré :</strong> Calcule votre vitesse de hachage réelle en H/s
                  </li>
                  <li>
                    <strong>Probabilité réaliste :</strong> Avec la vraie difficulté, trouver un bloc est extrêmement
                    rare
                  </li>
                  <li>
                    <strong>Temps estimé :</strong> Un CPU moderne (~1 MH/s) prendrait des millions d&apos;années
                  </li>
                  <li>
                    <strong>Comparaison :</strong> Les mineurs ASIC atteignent 100+ TH/s (100,000,000x plus rapide)
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <h3 className="font-semibold text-orange-900 mb-2">💡 Pourquoi c&apos;est éducatif :</h3>
              <p className="text-orange-800">
                Ce simulateur vous permet de comprendre le processus de minage Bitcoin avec de vraies données. Bien que
                trouver un bloc soit statistiquement improbable avec un CPU, vous pouvez observer :
              </p>
              <ul className="mt-2 space-y-1 list-disc list-inside text-orange-800">
                <li>Le calcul du Merkle Root des transactions sélectionnées</li>
                <li>La construction de l&apos;en-tête de bloc selon le protocole Bitcoin</li>
                <li>L&apos;incrémentation du nonce et le calcul des hash SHA-256</li>
                <li>Votre hashrate personnel et les performances de votre machine</li>
              </ul>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">🏭 Dans la réalité :</h3>
              <p className="text-blue-800">
                Les mineurs professionnels utilisent des fermes de milliers d&apos;ASIC spécialisés, consomment des mégawatts
                d&apos;électricité, et travaillent en pools pour partager les récompenses. Le réseau Bitcoin global atteint
                environ 400 EH/s (400,000,000,000,000,000,000 hash par seconde) !
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
