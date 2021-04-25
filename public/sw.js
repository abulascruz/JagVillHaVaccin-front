importScripts(
    'https://cdn.jsdelivr.net/npm/idb@6.0.0/build/iife/index-min.js'
)

const USE_RAW_GITHUB = false
const VMD_BASE_URL = USE_RAW_GITHUB
    ? "https://raw.githubusercontent.com/CovidTrackerFr/vitemadose/data-auto/data/output"
    : "https://vitemadose.gitlab.io/vitemadose"

let getVersionPort = undefined;
let pushNotificationsGranted=false;

// self.addEventListener('install', function(event) {
//     console.log('Service Worker activating...');
//     event.waitUntil(self.skipWaiting()); // Activate worker immediately
// });

self.addEventListener('activate', function(event) {
    console.log('Service Worker activating...');
    event.waitUntil(
        DB.initialize().then(function() {
            console.log('DB created !');
            return self.clients.claim();
        })
    );
});

self.addEventListener('sync', function(event) {
    console.log("sync event", event);
    if (event.tag === 'check-subscriptions') {
        checkSubscriptions();
    }
});
self.addEventListener("message", function(event) {
    if (event.data && event.data.type === 'INIT_PORT') {
        getVersionPort = event.ports[0];
    }

    if (event.data && event.data.type === 'UPDATE_PUSH_NOTIF_GRANT') {
        pushNotificationsGranted = event.data.granted;
        console.info("Update push notification granted to ["+pushNotificationsGranted+"]");
    }
});

function checkSubscriptions() {
    if(!pushNotificationsGranted) {
        console.info("Push notifications not granted, skipping any sync event !")
        return;
    }

    return DB.instance().then(function(db) {
        return db.transaction(["subscriptions"]).objectStore("subscriptions").getAll().then(function(results) {
            if (!results.length) {
                // No subscription declared, skipping
                return;
            }

            return rechercherAbonnementsAvecRdvDispos(results);
        }).then(function(abonnementsAvecRvdDispos) {
            return Promise.all(abonnementsAvecRvdDispos.map(function(abonnementAvecRvdDispos) {
                return Promise.all([
                    db.transaction(["subscriptions"], "readwrite").objectStore("subscriptions").delete(abonnementAvecRvdDispos.subscription.ts),
                    self.registration.showNotification(
                    "ViteMaDose - "+abonnementAvecRvdDispos.appointment_count+" créneaux trouvés",
                    {
                        lang: 'fr-FR',
                        body: abonnementAvecRvdDispos.appointment_count+" créneaux de vaccination trouvés sur "
                            + abonnementAvecRvdDispos.subscription.lieu.nom+" ("+abonnementAvecRvdDispos.subscription.departement.code_departement+")",
                        badge: 'https://deca76fefa39.ngrok.io/assets/images/png/vmd-badge.png',
                        icon: 'https://deca76fefa39.ngrok.io/assets/images/favicon/android-chrome-512x512.png',
                        // That's too big.. the icon above is enough
                        // image: 'https://deca76fefa39.ngrok.io/assets/images/favicon/android-chrome-512x512.png',
                        data: {
                            notificationUrl: abonnementAvecRvdDispos.subscription.notificationUrl,
                            departement: abonnementAvecRvdDispos.subscription.departement,
                            commune: abonnementAvecRvdDispos.subscription.commune
                        },
                    })
                ]);
            }));
        });
    })
}

function rechercherAbonnementsAvecRdvDispos(subscriptions) {
    const subscriptionsByCodesDepartement = subscriptions.reduce(function(codeDepartements, subscription) {
        codeDepartements.set(subscription.departement.code_departement, codeDepartements.get(subscription.departement.code_departement) || []);
        codeDepartements.get(subscription.departement.code_departement).push(subscription);
        return codeDepartements;
    }, new Map())

    return Promise.all(Array.from(subscriptionsByCodesDepartement.keys()).map(function(codeDepartement) {
        return fetch(VMD_BASE_URL + "/" + codeDepartement + ".json")
            .then(function(resp) { return resp.json(); })
            .then(function(centres) { return { centres: centres, codeDepartement: codeDepartement }; })
    })).then(function(results) {
        return results.reduce(function(abosAvecRdvDispos, centresParDepartement) {
            return subscriptionsByCodesDepartement.get(centresParDepartement.codeDepartement).reduce(function(abosAvecRdvDispos, subscription) {
                const centre = centresParDepartement.centres.centres_disponibles.find(function(l) {
                    // To be improved ??? With a levenshtein distance or something like this ? (in case lieu has been renamed a bit)
                    return subscription.lieu.nom === l.nom;
                });
                if(centre && centre.appointment_count) {
                    abosAvecRdvDispos.push({
                        subscription: subscription,
                        appointment_count: centre.appointment_count
                    });
                }
                return abosAvecRdvDispos;
            }, abosAvecRdvDispos);
        }, []);
    });
}

class DB {
    static _INSTANCE = new DB();
    static instance() {
        return DB._INSTANCE.db();
    }

    dbResolver;
    dbPromise;

    constructor() {
        var _this = this;
        this.dbPromise = new Promise(function(resolve) {
            _this.dbResolver = resolve;
        });
    }

    db() {
        return this.dbPromise;
    }

    static initialize() {
        var _this = DB._INSTANCE;
        idb.openDB('vite-ma-dose', 1, {
            upgrade(db, oldVersion, newVersion, transaction) {
                switch(oldVersion) {
                    case 0:
                        db.createObjectStore('subscriptions', { keyPath: 'ts' })
                        break;
                }
            },
            blocked() {
                console.error("openDB blocked")
            },
            blocking() {
                console.warn("Blocking openDB")
            },
            terminated() {
                console.info("Terminated openDB")
            },
        }).then(function(db) {
            _this.dbResolver(db);
        });
        return _this.dbPromise;
    }
}