<?php
// Read-only configuration/schema inventory. Never exports credentials or business rows.
require getenv('DOLIBARR_CONF') ?: '/var/www/html/dolibarr/htdocs/conf/conf.php';
$db = new PDO("mysql:host=$dolibarr_main_db_host;dbname=$dolibarr_main_db_name", $dolibarr_main_db_user, $dolibarr_main_db_pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('SET TRANSACTION READ ONLY');
$db->beginTransaction();
$prefix = $dolibarr_main_db_prefix;
$constants = $db->query("SELECT name,value,entity FROM {$prefix}const ORDER BY entity,name")->fetchAll(PDO::FETCH_ASSOC);
$modules = []; $settings = [];
foreach ($constants as $r) {
    if (preg_match('/^MAIN_MODULE_[A-Z0-9]+$/', $r['name']) && $r['value'] === '1') $modules[] = $r;
    if (preg_match('/^(STOCK_|WORKFLOW_|PRODUIT_|PRODUCTMIXER_|SOUS_TOTAL_|SUBTOTAL_|MYPRODUCT_|MYDISCOUNT_|PROPALE_|COMMANDE_|FACTURE_|FOURNISSEUR_|MULTICURRENCY_|MULTICOMPANY_|MARGIN_|IMPORTPROPALLINES_)/', $r['name']) && !preg_match('/PASS|TOKEN|SECRET|KEY|LOGIN|USER|EMAIL|HOST/', $r['name'])) $settings[] = $r;
}
$tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$counts = []; $schema = [];
foreach (['entity','product','product_rpn','product_association','societe','socpeople','propal','propaldet','commande','commandedet','commande_fournisseur','commande_fournisseurdet','facture','facturedet','facture_fourn','facture_fourn_det','expedition','expeditiondet','entrepot','stock_mouvement','bank_account','bank','paiement','paiementfourn','c_payment_term','c_paiement','c_incoterms','c_shipment_mode'] as $name) {
    $table = $prefix.$name;
    if (!in_array($table, $tables, true)) continue;
    $counts[$name] = (int)$db->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    $schema[$name] = $db->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
}
$extra = $db->query("SELECT name,label,type,size,elementtype,fieldrequired,fieldunique,entity FROM {$prefix}extrafields ORDER BY entity,elementtype,pos")->fetchAll(PDO::FETCH_ASSOC);
$entities = [];
if (in_array($prefix.'entity', $tables, true)) {
    foreach ($db->query("SELECT rowid,options,active,visible FROM {$prefix}entity ORDER BY rowid")->fetchAll(PDO::FETCH_ASSOC) as $entity) {
        $options = json_decode($entity['options'], true) ?: [];
        $entities[] = ['id' => $entity['rowid'], 'active' => $entity['active'], 'visible' => $entity['visible'], 'sharings' => $options['sharings'] ?? [], 'referent' => $options['referent'] ?? null];
    }
}
$descriptors = [];
$dictionaries = [];
foreach (['c_incoterms' => 'code,libelle,active', 'c_payment_term' => 'code,libelle,nbjour,decalage,active,entity', 'c_paiement' => 'code,libelle,type,active,entity', 'c_shipment_mode' => 'code,libelle,active,entity'] as $table => $columns) {
    $dictionaries[$table] = $db->query("SELECT $columns FROM {$prefix}$table ORDER BY code")->fetchAll(PDO::FETCH_ASSOC);
}
foreach (glob('/var/www/html/dolibarr/htdocs/{core/modules,*/core/modules}/mod*.class.php', GLOB_BRACE) as $file) {
    $source = file_get_contents($file);
    foreach ($modules as $module) {
        $name = substr($module['name'], 12);
        if (stripos(basename($file), 'mod'.$name.'.class.php') === false) continue;
        $descriptors[$name] = ['path' => $file, 'sha256' => hash('sha256', $source)];
    }
}
$db->rollBack();
echo json_encode(['auditedAt' => gmdate('c'), 'version' => '12.0.3', 'modules' => $modules, 'settings' => $settings, 'entities' => $entities, 'dictionaries' => $dictionaries, 'extrafields' => $extra, 'recordCounts' => $counts, 'schema' => $schema, 'moduleSources' => $descriptors], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
