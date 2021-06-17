import {
    css,
    customElement,
    html,
    LitElement,
    property,
    PropertyValues, query,
    unsafeCSS
} from 'lit-element';
import {classMap} from "lit-html/directives/class-map";
import {
    Lieu,
    LieuAffichableAvecDistance,
    Plateforme,
    PLATEFORMES,
    typeActionPour,
    TYPES_LIEUX
} from "../state/State";
import {Router} from "../routing/Router";
import appointmentCardCss from "./vmd-appointment-card.component.scss";
import {Strings} from "../utils/Strings";
import {TemplateResult} from "lit-html";
import {CSS_Global} from "../styles/ConstructibleStyleSheets";
import tippy from "tippy.js";
import { format as formatDate, parseISO } from "date-fns"
import { sv } from 'date-fns/locale'

type LieuCliqueContext = {lieu: Lieu};
export type LieuCliqueCustomEvent = CustomEvent<LieuCliqueContext>;

@customElement('vmd-appointment-card')
export class VmdAppointmentCardComponent extends LitElement {

    //language=css
    static styles = [
        CSS_Global,
        css`${unsafeCSS(appointmentCardCss)}`,
        css`
        `
    ];

    @property({type: Object, attribute: false}) lieu!: LieuAffichableAvecDistance;
    @property({type: String}) theme!: string;
    @property() highlightable!: boolean;

    @query("#chronodose-label") $chronodoseLabel!: HTMLSpanElement;

    constructor() {
        super();
    }

    prendreRdv() {
        this.dispatchEvent(new CustomEvent<LieuCliqueContext>('prise-rdv-cliquee', {
            detail: { lieu: this.lieu }
        }));
    }

    verifierRdv() {
        this.dispatchEvent(new CustomEvent<LieuCliqueContext>('verification-rdv-cliquee', {
            detail: { lieu: this.lieu }
        }));
    }

    isFromScaredRegion() {
        //let ScaredRegions = ["08", "22", "18"];
        //let isFromTheSevenRegions = ScaredRegions.includes(this.lieu.departement);
        //let isMittVaccin = (this.lieu.plateforme == "MittVaccin");
        //return isMittVaccin && isFromTheSevenRegions;
        return false;
    }

    render() {
            const plateforme: Plateforme|undefined = PLATEFORMES[this.lieu.plateforme];
            let distance: string|undefined;
            if (this.lieu.distance && this.lieu.distance >= 10) {
              distance = this.lieu.distance.toFixed(0)
            } else if (this.lieu.distance) {
              distance = this.lieu.distance.toFixed(1)
            }

            // FIXME créer un type `SearchResultItem` ou un truc du genre, pour avoir une meilleure vue des cas possibles
            // Qu'un if-pit de 72 lignes de long et 190 colonnes de large xD
            let cardConfig: {
                highlighted: boolean
                cardLink:(content: TemplateResult) => TemplateResult,
                estCliquable: boolean, disabledBG: boolean,
                actions: TemplateResult|undefined, libelleDateAbsente: string
            };
            let typeLieu = typeActionPour(this.lieu);

            if(typeLieu === 'actif-via-plateforme' || typeLieu === 'inactif-via-plateforme') {
                let specificCardConfig: { disabledBG: boolean, libelleDateAbsente: string, libelleBouton: string, typeBouton: 'btn-info'|'btn-primary', onclick: ()=>void };
                if(typeLieu === 'inactif-via-plateforme') {
                    specificCardConfig = {
                        disabledBG: true,
                        libelleDateAbsente: 'Inga vaccintider',
                        libelleBouton: 'Kolla manuellt på 1177',
                        typeBouton: 'btn-info',
                        onclick: () => this.verifierRdv()
                    };
                } else {
                    specificCardConfig = {
                        disabledBG: false,
                        libelleDateAbsente: 'Okänt datum',
                        libelleBouton: 'Till vaccinationsbokning',
                        typeBouton: 'btn-primary',
                        onclick: () => this.prendreRdv()
                    };
                }

                cardConfig = {
                    highlighted: this.highlightable && !specificCardConfig.disabledBG,
                    estCliquable: false,
                    disabledBG: specificCardConfig.disabledBG,
                    libelleDateAbsente: specificCardConfig.libelleDateAbsente,
                    cardLink: (content) =>
                        html`<a href="#" @click="${(e: Event) => { specificCardConfig.onclick(); e.preventDefault(); } }">${content}</a>`,
                    actions: html`
                      <a href="#" @click="${(e: Event) => e.preventDefault()}"
                         class="btn btn-lg ${classMap({ 'btn-primary': specificCardConfig.typeBouton==='btn-primary', 'btn-info': specificCardConfig.typeBouton==='btn-info' })}">
                        ${specificCardConfig.libelleBouton}
                      </a>
                      <div class="row align-items-center justify-content-center mt-3 text-gray-700">
                        <div class="col-auto text-description">
                          ${this.lieu.appointment_count.toLocaleString()} tid${Strings.plural(this.lieu.appointment_count, "er")}
                        </div>
                      </div>
                    `
                };
                if(typeLieu === 'inactif-via-plateforme') {
                  cardConfig.actions = html``
                  cardConfig.cardLink = (content) =>
                        html`${content}`
                }
            } else if(typeLieu === 'actif-via-tel') {
                cardConfig = {
                    highlighted: false,
                    estCliquable: true,
                    disabledBG: false,
                    libelleDateAbsente: 'Kan inte hämta tider för mottagningen',
                    cardLink: (content) => html`
                          <a href="${this.lieu.url}">
                            ${content}
                          </a>`,
                    actions: html`
                          <a href="${this.lieu.url}" class="btn btn-tel btn-lg">
                            Kolla på mottagningssidan
                          </a>
                          <div class="row align-items-center justify-content-center mt-3 text-gray-700">
                            <div class="col-auto">
                                ${plateforme?html`
                                <img class="rdvPlatformLogo ${plateforme.styleCode}" src="${Router.basePath}assets/images/png/${plateforme.logo}" alt="Créneau de vaccination ${plateforme.nom}">
                                `:html`
                                ${this.lieu.plateforme}
                                `}
                            </div>
                          </div>
                        `
                };
            } else if(typeLieu === 'inactif') {
                cardConfig = {
                    highlighted: false,
                    estCliquable: false,
                    disabledBG: true,
                    libelleDateAbsente: 'Inga vaccintider',
                    cardLink: (content) => content,
                    actions: undefined
                };
            } else {
                throw new Error(`Unsupported typeLieu : ${typeLieu}`)
            }
            if (this.isFromScaredRegion()) {
              cardConfig = {
                    highlighted: false,
                    estCliquable: false,
                    disabledBG: true,
                    libelleDateAbsente: 'Inga vaccintider',
                    cardLink: (content) => content,
                    actions: undefined
                };
            }

            return cardConfig.cardLink(html`
            <div class="card rounded-3 mb-5  ${classMap({
              highlighted: cardConfig.highlighted, clickable: cardConfig.estCliquable,
              'bg-disabled': cardConfig.disabledBG,
              'search-standard': this.theme==='standard',
              'search-chronodose': this.theme==='chronodose'
                })}"
                 title="${cardConfig.estCliquable ? this.lieu.url : ''}">
                ${cardConfig.highlighted?html`
                <div class="row align-items-center highlight-text">
                  <span id="chronodose-label" title="Les chronodoses sont des doses de vaccin réservables à court terme sans critères d'éligibilité"><i class="bi vmdicon-lightning-charge-fill"></i>Chronodoses disponibles<i class="bi vmdicon-lightning-charge-fill"></i></span>
                </div>`:html``}
                <div class="card-body p-4">
                    <div class="row align-items-center ">
                        <div class="col">
                            <h3 class="card-title h5">
                              ${this.cardTitle(cardConfig)}
                              <small class="distance">${distance ? `- ${distance} km` : ''}</small>
                            </h3>
                            <div class="row">
                              <vmd-appointment-metadata class="mb-2" widthType="full-width" icon="vmdicon-geo-alt-fill">
                                <div slot="content">
                                  <span class="fw-bold">${this.lieu.nom}</span>
                                  <br/>
                                  <span class="text-description">${this.lieu.metadata.address}</span>
                                </div>
                              </vmd-appointment-metadata>
                              <vmd-appointment-metadata class="mb-2" widthType="fit-to-content" icon="vmdicon-telephone-fill" .displayed="${!!this.lieu.metadata.phone_number}">
                                <span slot="content">
                                    <a href="tel:${this.lieu.metadata.phone_number}"
                                       @click="${(e: Event) => { e.stopImmediatePropagation(); }}">
                                        ${Strings.toNormalizedPhoneNumber(this.lieu.metadata.phone_number)}
                                    </a>
                                </span>
                              </vmd-appointment-metadata>
                              <vmd-appointment-metadata class="mb-2" widthType="fit-to-content" icon="vmdicon-commerical-building">
                                <span class="text-description" slot="content">${TYPES_LIEUX[this.lieu.type]}</span>
                              </vmd-appointment-metadata>
                              <vmd-appointment-metadata class="mb-2" widthType="fit-to-content" icon="vmdicon-syringe" .displayed="${!!this.lieu.vaccine_type}">
                                <span class="text-description" slot="content">${this.lieu.vaccine_type}</span>
                              </vmd-appointment-metadata>
                            </div>
                        </div>

                        ${cardConfig.actions?html`
                        <div class="col-24 col-md-auto text-center mt-4 mt-md-0">
                          ${cardConfig.actions}
                        </div>
                        `:html``}
                    </div>
                </div>
            </div>
            `);
    }

    updated(changedProperties: PropertyValues) {
        super.updated(changedProperties);
        tippy(this.$chronodoseLabel, {
            content: (el) => el.getAttribute('title')!
        })
    }

    private cardTitle(cardConfig: any): string {
      if (this.isFromScaredRegion()) {
        return "Tillgängliga tider kan inte visas i enlighet med regionens begäran"
      }
      if (this.lieu.prochain_rdv) {
        return this.toTitleCase(formatDate(parseISO(this.lieu.prochain_rdv), "EEEE d MMMM 'kl.'HH:mm", { locale: sv }))
      } else {
        return cardConfig.libelleDateAbsente
      }
    }
    private toTitleCase(date: string): string {
      return date.replace(/(^|\s)([a-z])(\w)/g, (_, leader, letter, loser) => [leader, letter.toUpperCase(), loser].join(''))
    }
}
